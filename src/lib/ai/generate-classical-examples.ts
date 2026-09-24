/**
 * Classical Japanese (古文) example sentence generation.
 *
 * 英語側の generate-example-sentences.ts と同じ形（1語1コール・5並列・
 * 1回リトライ・DB保存は呼び出し側の責任）を意図的に踏襲している。
 * 別形にすると、片方だけ直してもう片方が古いまま、が必ず起きる。
 *
 * 英語版との違いは3つだけ:
 *   - プロンプトが古文用（出典を書かせない。詳細は prompts/classical-example.ts）
 *   - 品詞タグを返さない。英語の品詞体系（noun/verb/...）は古典語に当たらないし、
 *     古典語の活用種別は共通辞書 classical_entries.conjugation_type が持っている
 *   - ジャンル指定（example_genres）を受けない。古文の例文をSFやスポーツに
 *     寄せる意味がない
 */

import { z } from 'zod';
import { AI_CONFIG, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import {
  CLASSICAL_EXAMPLE_SYSTEM_PROMPT,
  buildClassicalExampleUserPrompt,
} from '@/lib/ai/prompts/classical-example';

// ---------- Types ----------

export interface ClassicalExampleSeedWord {
  id: string;
  /** 見出し語（古典語）。 */
  headword: string;
  /** この語義で使わせる。多義語は代表義（先頭）を渡す。 */
  meaning: string;
  reading?: string;
  conjugationType?: string;
}

export interface GeneratedClassicalExample {
  wordId: string;
  /** 古文の例文。 */
  exampleSentence: string;
  /** その現代語訳。 */
  exampleSentenceJa: string;
}

export interface GenerateClassicalExamplesResult {
  examples: GeneratedClassicalExample[];
  errors: string[];
  summary: { requested: number; generated: number; failed: number; retried: number };
}

// ---------- Schema ----------

const classicalExampleSchema = z.object({
  exampleSentence: z.string(),
  exampleSentenceJa: z.string(),
});

/** Gemini Controlled Generation schema mirroring `classicalExampleSchema`. */
export const CLASSICAL_EXAMPLE_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    exampleSentence: { type: 'STRING' },
    exampleSentenceJa: { type: 'STRING' },
  },
  required: ['exampleSentence', 'exampleSentenceJa'],
  propertyOrdering: ['exampleSentence', 'exampleSentenceJa'],
};

const CONCURRENCY = 5;

type GenerateSingleDependency = (
  word: ClassicalExampleSeedWord,
  apiKeys: { gemini?: string; openai?: string },
) => Promise<GeneratedClassicalExample>;

/**
 * 生成結果が本当に古文かどうかの最低限の検査。
 *
 * 古文の例文にラテン文字は出てこないので、混じっていたらプロンプトが効いて
 * いない（英語例文が返ってきた）ということ。そのまま保存すると、#558 で
 * 塞いだはずの「古典語に英文が付く」状態を自分で作ってしまう。
 */
function looksLikeClassicalSentence(sentence: string): boolean {
  return sentence.length > 0 && !/[A-Za-z]/.test(sentence);
}

export const __internal = {
  looksLikeClassicalSentence,
  buildClassicalExamplePrompt,
  generateSingle,
};

// ---------- Core ----------

/**
 * 古典語のリストに対して古文の例文＋現代語訳を生成する。
 *
 * 失敗はすべて best-effort に握りつぶす。例文が付かないだけで、
 * スキャンそのものは成功させる。
 */
export async function generateClassicalExamples(
  words: ClassicalExampleSeedWord[],
  apiKeys: { gemini?: string; openai?: string },
  deps: { generateSingle?: GenerateSingleDependency } = {},
): Promise<GenerateClassicalExamplesResult> {
  const summary = { requested: words.length, generated: 0, failed: 0, retried: 0 };
  if (words.length === 0) {
    return { examples: [], errors: [], summary };
  }

  const generateSingleWord = deps.generateSingle ?? generateSingle;
  const examples: GeneratedClassicalExample[] = [];
  const errors: string[] = [];
  const failures: ClassicalExampleSeedWord[] = [];

  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((word) => generateSingleWord(word, apiKeys)));
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        examples.push(result.value);
      } else {
        failures.push(chunk[index]!);
      }
    }
  }

  // 失敗した語だけ1回リトライ（英語側と同じ方針）
  summary.retried = failures.length;
  if (failures.length > 0) {
    for (let i = 0; i < failures.length; i += CONCURRENCY) {
      const chunk = failures.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(chunk.map((word) => generateSingleWord(word, apiKeys)));
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          examples.push(result.value);
        } else {
          const word = chunk[index]!;
          const message = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          errors.push(`${word.headword}: ${message}`);
        }
      }
    }
  }

  summary.generated = examples.length;
  summary.failed = words.length - examples.length;

  if (summary.failed > 0) {
    console.warn(
      `[generate-classical-examples] ${summary.failed}/${words.length} words missing after retry`,
    );
  }

  return { examples, errors, summary };
}

function buildClassicalExamplePrompt(word: ClassicalExampleSeedWord): string {
  const userPrompt = buildClassicalExampleUserPrompt({
    headword: word.headword,
    meaning: word.meaning,
    reading: word.reading,
    conjugationType: word.conjugationType,
  });
  return `${CLASSICAL_EXAMPLE_SYSTEM_PROMPT}\n\n${userPrompt}`;
}

async function generateSingle(
  word: ClassicalExampleSeedWord,
  apiKeys: { gemini?: string; openai?: string },
  deps: { getProviderFromConfig?: typeof getProviderFromConfig } = {},
): Promise<GeneratedClassicalExample> {
  const config = AI_CONFIG.defaults.openai;
  const resolveProvider = deps.getProviderFromConfig ?? getProviderFromConfig;
  const provider = resolveProvider(config, apiKeys);

  const aiResponse = await provider.generateText(buildClassicalExamplePrompt(word), {
    ...config,
    maxOutputTokens: 512,
    responseFormat: 'json',
    responseSchema: CLASSICAL_EXAMPLE_RESPONSE_SCHEMA,
  });

  if (!aiResponse.success) {
    throw new Error(`AI generation failed for "${word.headword}": ${aiResponse.error}`);
  }

  const parsed = classicalExampleSchema.parse(parseJsonResponse(aiResponse.content));
  const exampleSentence = parsed.exampleSentence.trim();
  const exampleSentenceJa = parsed.exampleSentenceJa.trim();

  if (!exampleSentence || !exampleSentenceJa) {
    throw new Error(`Empty classical example returned for "${word.headword}"`);
  }

  // ラテン文字が混じっていたら英語例文が返ってきたということ。捨てる。
  if (!looksLikeClassicalSentence(exampleSentence)) {
    throw new Error(`Non-classical example returned for "${word.headword}"`);
  }

  return { wordId: word.id, exampleSentence, exampleSentenceJa };
}
