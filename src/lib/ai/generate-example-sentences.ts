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
import { parseJsonResponse } from '@/lib/ai/utils/json';
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

export type ExampleGenerationFailureKind = 'provider' | 'parse' | 'validation' | 'empty';

export interface ExampleGenerationSummary {
  requested: number;
  generated: number;
  failed: number;
  retried: number;
  retryRecovered: number;
  failureKinds: Record<ExampleGenerationFailureKind, number>;
}

export interface GenerateExamplesResult {
  examples: GeneratedExample[];
  errors: string[];
  summary: ExampleGenerationSummary;
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
const partOfSpeechTagsSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}, z.array(z.string()).default([]));

const singleExampleSchema = z.object({
  partOfSpeechTags: partOfSpeechTagsSchema,
  exampleSentence: z.string(),
  exampleSentenceJa: z.string(),
});

const CONCURRENCY = 5;

class ExampleGenerationError extends Error {
  constructor(
    readonly kind: ExampleGenerationFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ExampleGenerationError';
  }
}

type GenerateSingleDependency = (
  word: ExampleSeedWord,
  apiKeys: { gemini?: string; openai?: string },
) => Promise<GeneratedExample>;

function createFailureKindCounts(): Record<ExampleGenerationFailureKind, number> {
  return {
    provider: 0,
    parse: 0,
    validation: 0,
    empty: 0,
  };
}

function createSummary(requested: number): ExampleGenerationSummary {
  return {
    requested,
    generated: 0,
    failed: 0,
    retried: 0,
    retryRecovered: 0,
    failureKinds: createFailureKindCounts(),
  };
}

function extractJsonStringField(text: string, fieldName: string): string | null {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`);
  const match = text.match(pattern);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}

function extractPartOfSpeechTags(text: string): string[] | null {
  const arrayMatch = text.match(/"partOfSpeechTags"\s*:\s*(\[[\s\S]*?\])/);
  if (arrayMatch?.[1]) {
    try {
      const parsed = JSON.parse(arrayMatch[1]);
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : null;
    } catch {
      // Fall through to string parsing.
    }
  }

  const stringMatch = text.match(/"partOfSpeechTags"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (stringMatch?.[1]) {
    try {
      return [JSON.parse(stringMatch[1]) as string];
    } catch {
      return null;
    }
  }

  return null;
}

function salvageSingleExampleResponse(text: string): z.input<typeof singleExampleSchema> | null {
  const exampleSentence = extractJsonStringField(text, 'exampleSentence');
  const exampleSentenceJa = extractJsonStringField(text, 'exampleSentenceJa');

  if (!exampleSentence || !exampleSentenceJa) {
    return null;
  }

  return {
    partOfSpeechTags: extractPartOfSpeechTags(text) ?? [],
    exampleSentence,
    exampleSentenceJa,
  };
}

function parseSingleExampleResponse(content: string): z.output<typeof singleExampleSchema> {
  try {
    return singleExampleSchema.parse(parseJsonResponse(content));
  } catch (error) {
    const salvaged = salvageSingleExampleResponse(content);
    if (salvaged) {
      try {
        return singleExampleSchema.parse(salvaged);
      } catch (salvageError) {
        if (salvageError instanceof z.ZodError) {
          throw new ExampleGenerationError('validation', `Invalid example response: ${salvageError.message}`);
        }
      }
    }

    if (error instanceof z.ZodError) {
      throw new ExampleGenerationError('validation', `Invalid example response: ${error.message}`);
    }

    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new ExampleGenerationError('parse', `Failed to parse example response: ${message}`);
  }
}

function classifyExampleGenerationError(error: unknown): ExampleGenerationFailureKind {
  if (error instanceof ExampleGenerationError) {
    return error.kind;
  }
  if (error instanceof z.ZodError) {
    return 'validation';
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('AI generation failed')) return 'provider';
  if (message.includes('Empty example sentence')) return 'empty';
  if (message.includes('parse') || message.includes('JSON')) return 'parse';
  return 'validation';
}

function formatTerminalError(word: ExampleSeedWord, error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return `${word.english}: ${message}`;
}

export const __internal = {
  parseSingleExampleResponse,
  classifyExampleGenerationError,
  createSummary,
};

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
  deps: { generateSingle?: GenerateSingleDependency } = {},
): Promise<GenerateExamplesResult> {
  const summary = createSummary(words.length);
  if (words.length === 0) {
    return { examples: [], errors: [], summary };
  }

  const generateSingleWord = deps.generateSingle ?? generateSingle;
  const allExamples: GeneratedExample[] = [];
  const errors: string[] = [];
  const firstPassFailures: Array<{ word: ExampleSeedWord; reason: unknown }> = [];

  // Process words in chunks of CONCURRENCY
  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(word => generateSingleWord(word, apiKeys)),
    );
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        allExamples.push(result.value);
      } else {
        firstPassFailures.push({ word: chunk[index]!, reason: result.reason });
      }
    }
  }

  // Retry failed words once
  const failedWords = firstPassFailures.map((entry) => entry.word);
  summary.retried = failedWords.length;

  if (failedWords.length > 0) {
    console.log(`[generate-example-sentences] Retrying ${failedWords.length} failed words`);
    const terminalFailures: Array<{ word: ExampleSeedWord; reason: unknown }> = [];

    for (let i = 0; i < failedWords.length; i += CONCURRENCY) {
      const chunk = failedWords.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(word => generateSingleWord(word, apiKeys)),
      );
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          allExamples.push(result.value);
          summary.retryRecovered++;
        } else {
          terminalFailures.push({ word: chunk[index]!, reason: result.reason });
        }
      }
    }

    for (const failure of terminalFailures) {
      const kind = classifyExampleGenerationError(failure.reason);
      summary.failureKinds[kind]++;
      const msg = formatTerminalError(failure.word, failure.reason);
      console.error('[generate-example-sentences] Retry failed:', msg);
      errors.push(msg);
    }
  }

  summary.generated = allExamples.length;
  summary.failed = words.length - allExamples.length;

  if (summary.failed > 0) {
    console.warn(`[generate-example-sentences] ${summary.failed}/${words.length} words missing after retry`);
  } else {
    console.log(`[generate-example-sentences] All ${words.length} words generated successfully`);
  }

  return { examples: allExamples, errors, summary };
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
    throw new ExampleGenerationError('provider', `AI generation failed for "${word.english}": ${aiResponse.error}`);
  }

  const parsed = parseSingleExampleResponse(aiResponse.content);
  const exampleSentence = parsed.exampleSentence.trim();
  const exampleSentenceJa = parsed.exampleSentenceJa.trim();

  if (!exampleSentence || !exampleSentenceJa) {
    throw new ExampleGenerationError('empty', `Empty example sentence returned for "${word.english}"`);
  }

  return {
    wordId: word.id,
    partOfSpeechTags: normalizePartOfSpeechTags(parsed.partOfSpeechTags),
    exampleSentence,
    exampleSentenceJa,
  };
}
