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

  // Batch into groups of BATCH_SIZE
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);

    try {
      const batchResult = await generateBatch(batch, apiKeys);
      allExamples.push(...batchResult);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[generate-example-sentences] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, msg);
      errors.push(msg);
    }
  }

  return { examples: allExamples, errors };
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
