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

const exampleResponseSchema = z.object({
  examples: z.array(z.object({
    wordId: z.string(),
    partOfSpeechTags: z.array(z.string()).optional().default([]),
    exampleSentence: z.string(),
    exampleSentenceJa: z.string(),
  })),
});

// ---------- Prompt ----------

const SYSTEM_PROMPT = `あなたは英語教師です。与えられた英単語リストに対して、それぞれの単語を使った自然な英語の例文を生成してください。

【ルール】
1. 各単語に対して1つの例文を生成
2. 例文は10〜20語程度の実用的で分かりやすい文
3. 中学〜高校レベルの難易度
4. 例文の日本語訳も生成
5. 熟語の場合は、その熟語全体を例文に含める
6. 各単語の主分類を partOfSpeechTags として1つだけ返す
7. partOfSpeechTags は noun, verb, adjective, adverb, idiom, phrasal_verb, preposition, conjunction, pronoun, determiner, interjection, auxiliary, other のいずれか1つだけにする

【出力形式】JSON
{
  "examples": [
    {
      "wordId": "単語ID",
      "partOfSpeechTags": ["noun"],
      "exampleSentence": "Example sentence using the word.",
      "exampleSentenceJa": "その単語を使った例文の日本語訳。"
    }
  ]
}`;

const BATCH_SIZE = 30;

// ---------- Core ----------

/**
 * 単語リストに対して例文を生成する。
 *
 * - 30語ずつバッチ処理
 * - 各バッチのAIエラーは収集するが、他バッチは続行
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

  // Run batches with concurrency limit of 3
  const CONCURRENCY = 3;
  const batches: ExampleSeedWord[][] = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    batches.push(words.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(batch => generateBatch(batch, apiKeys)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allExamples.push(...result.value);
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        console.error('[generate-example-sentences] Batch failed:', msg);
        errors.push(msg);
      }
    }
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

async function generateBatch(
  words: ExampleSeedWord[],
  apiKeys: { gemini?: string; openai?: string },
): Promise<GeneratedExample[]> {
  const config = AI_CONFIG.defaults.openai;
  const provider = getProviderFromConfig(config, apiKeys);

  const wordListText = words
    .map((w) => `- wordId: "${w.id}", english: "${w.english}", japanese: "${w.japanese}"`)
    .join('\n');

  const userPrompt = `以下の単語リストに対して例文を生成してください：\n\n${wordListText}`;

  const aiResponse = await provider.generateText(
    `${SYSTEM_PROMPT}\n\n${userPrompt}`,
    {
      ...config,
      responseFormat: 'json',
    },
  );

  if (!aiResponse.success) {
    throw new Error(`AI generation failed: ${aiResponse.error}`);
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

  const parsed = exampleResponseSchema.parse(JSON.parse(content));

  // Validate wordIds — only return examples for words we actually requested
  const requestedIds = new Set(words.map((w) => w.id));

  return parsed.examples
    .filter((ex) => requestedIds.has(ex.wordId))
    .map((ex) => ({
      wordId: ex.wordId,
      partOfSpeechTags: normalizePartOfSpeechTags(ex.partOfSpeechTags),
      exampleSentence: ex.exampleSentence,
      exampleSentenceJa: ex.exampleSentenceJa,
    }));
}
