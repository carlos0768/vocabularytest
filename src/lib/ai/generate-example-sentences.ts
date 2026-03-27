/**
 * Example Sentence Generation (shared logic)
 *
 * スキャン後の同期例文生成と、オンデマンド生成の両方から使える共通関数。
 * AIプロバイダー経由で例文・品詞タグを生成し、結果を返す。
 * DB保存は呼び出し側の責任。
 */

import { z } from 'zod';
import { AI_CONFIG } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// ---------- Types ----------

export interface ExampleSeedWord {
  id: string;
  english: string;
  japanese: string;
}

export interface GeneratedExample {
  wordId: string;
  partOfSpeechTags: string[];
  exampleSentence: string;
  exampleSentenceJa: string;
}

export interface GenerateExamplesResult {
  examples: GeneratedExample[];
  errors: string[];
}

// ---------- Schema ----------

// Legacy batch schema (kept for /api/generate-examples route compatibility)
const exampleResponseSchema = z.object({
  examples: z.array(z.object({
    wordId: z.string(),
    partOfSpeechTags: z.array(z.string()).optional().default([]),
    exampleSentence: z.string(),
    exampleSentenceJa: z.string(),
  })),
});

// ---------- Prompt ----------

const SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語に対して、その単語を使った自然な英語の例文を1つ生成してください。

【ルール】
1. 例文は10〜20語程度の実用的で分かりやすい文
2. 中学〜高校レベルの難易度
3. 例文の日本語訳も生成
4. 熟語の場合は、その熟語全体を例文に含める
5. 単語の主分類を partOfSpeechTags として1つだけ返す
6. partOfSpeechTags は noun, verb, adjective, adverb, idiom, phrasal_verb, preposition, conjunction, pronoun, determiner, interjection, auxiliary, other のいずれか1つだけにする

【出力形式】JSON
{
  "partOfSpeechTags": ["noun"],
  "exampleSentence": "Example sentence using the word.",
  "exampleSentenceJa": "その単語を使った例文の日本語訳。"
}`;

// Schema for single-word response
const singleExampleSchema = z.object({
  partOfSpeechTags: z.array(z.string()).optional().default([]),
  exampleSentence: z.string(),
  exampleSentenceJa: z.string(),
});

const CONCURRENCY = 5;

// ---------- Core ----------

/**
 * 単語リストに対して例文を生成する。
 *
 * - 1語ずつ個別にAI呼び出し（バッチだとGeminiが一部の単語を飛ばす問題の回避）
 * - 5並列で実行（速度とレート制限のバランス）
 * - 失敗した単語は1回リトライ
 * - DB保存は行わない（呼び出し側の責任）
 */
export async function generateExampleSentences(
  words: ExampleSeedWord[],
  apiKeys: { gemini?: string; openai?: string },
): Promise<GenerateExamplesResult> {
  if (words.length === 0) {
    return { examples: [], errors: [] };
  }

  const allExamples: GeneratedExample[] = [];
  const errors: string[] = [];

  // Process words in chunks of CONCURRENCY
  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(word => generateSingle(word, apiKeys)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allExamples.push(result.value);
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        errors.push(msg);
      }
    }
  }

  // Retry failed words once
  const succeededIds = new Set(allExamples.map(ex => ex.wordId));
  const failedWords = words.filter(w => !succeededIds.has(w.id));

  if (failedWords.length > 0) {
    console.log(`[generate-example-sentences] Retrying ${failedWords.length} failed words`);
    for (let i = 0; i < failedWords.length; i += CONCURRENCY) {
      const chunk = failedWords.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(word => generateSingle(word, apiKeys)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allExamples.push(result.value);
        } else {
          const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          console.error('[generate-example-sentences] Retry failed:', msg);
          errors.push(msg);
        }
      }
    }
  }

  const finalSucceeded = allExamples.length;
  const finalMissing = words.length - finalSucceeded;
  if (finalMissing > 0) {
    console.warn(`[generate-example-sentences] ${finalMissing}/${words.length} words missing after retry`);
  } else {
    console.log(`[generate-example-sentences] All ${words.length} words generated successfully`);
  }

  return { examples: allExamples, errors };
}

/**
 * 生成した例文を lexicon_entries (マスターDB) にも保存する。
 * word の lexicon_entry_id が存在し、かつ lexicon_entries 側に例文がない場合のみ更新。
 */
export async function saveExamplesToLexicon(
  wordExamples: Array<{
    lexiconEntryId: string;
    exampleSentence: string;
    exampleSentenceJa: string;
  }>,
): Promise<{ updated: number; errors: number }> {
  if (wordExamples.length === 0) return { updated: 0, errors: 0 };

  const supabaseAdmin = getSupabaseAdmin();
  let updated = 0;
  let errors = 0;

  for (const item of wordExamples) {
    try {
      const { error } = await supabaseAdmin
        .from('lexicon_entries')
        .update({
          example_sentence: item.exampleSentence,
          example_sentence_ja: item.exampleSentenceJa,
        })
        .eq('id', item.lexiconEntryId)
        .is('example_sentence', null); // Only update if no example yet

      if (error) {
        console.error(`[saveExamplesToLexicon] Failed for ${item.lexiconEntryId}:`, error);
        errors++;
      } else {
        updated++;
      }
    } catch (e) {
      console.error(`[saveExamplesToLexicon] Exception for ${item.lexiconEntryId}:`, e);
      errors++;
    }
  }

  return { updated, errors };
}

async function generateSingle(
  word: ExampleSeedWord,
  apiKeys: { gemini?: string; openai?: string },
): Promise<GeneratedExample> {
  const config = AI_CONFIG.defaults.openai;
  const provider = getProviderFromConfig(config, apiKeys);

  const userPrompt = `単語: "${word.english}" (${word.japanese})\n\nこの単語を使った例文を生成してください。`;

  const aiResponse = await provider.generateText(
    `${SYSTEM_PROMPT}\n\n${userPrompt}`,
    {
      ...config,
      maxOutputTokens: 512,
      responseFormat: 'json',
    },
  );

  if (!aiResponse.success) {
    throw new Error(`AI generation failed for "${word.english}": ${aiResponse.error}`);
  }

  // Parse response
  let content = aiResponse.content;
  if (content.startsWith('```json')) {
    content = content.slice(7);
  } else if (content.startsWith('```')) {
    content = content.slice(3);
  }
  if (content.endsWith('```')) {
    content = content.slice(0, -3);
  }
  content = content.trim();

  const parsed = singleExampleSchema.parse(JSON.parse(content));

  return {
    wordId: word.id,
    partOfSpeechTags: normalizePartOfSpeechTags(parsed.partOfSpeechTags),
    exampleSentence: parsed.exampleSentence,
    exampleSentenceJa: parsed.exampleSentenceJa,
  };
}
