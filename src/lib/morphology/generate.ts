/**
 * 語源解析の AI 生成
 *
 * generate-example-sentences.ts と同じ構造:
 * - 1語ずつ個別に AI 呼び出し（バッチだと Gemini が一部の単語を飛ばすため）
 * - 5並列・失敗1回リトライ
 * - DB 保存は呼び出し側（resolve.ts）の責任
 *
 * トークン節約のため、プロンプトには「その単語にマッチした接辞候補」だけを
 * `id|form|kind|meaning` の行形式で送る。綴りが同じで意味が違う接辞は全 sense を
 * 送り、AI に id で指定させる。候補にない affixId が返ったら validation 失敗。
 */

import { AI_CONFIG, type ResponseSchema } from '@/lib/ai/config';
import { getProviderFromConfig } from '@/lib/ai/providers';
import { parseJsonResponse } from '@/lib/ai/utils/json';
import {
  clampExplanationLines,
  morphologyAiResponseSchema,
  MORPHOLOGY_PART_KINDS,
} from '@/lib/schemas/morphology';
import type { WordMorphology, WordMorphologyPart } from '../../../shared/types';
import type { AffixSense } from './affix-catalog';

// ---------- Types ----------

export interface MorphologySeedWord {
  english: string;
  candidates: AffixSense[];
}

export interface GeneratedMorphology {
  english: string;
  /** null = AI が「接辞構造なし」と判定 */
  morphology: WordMorphology | null;
}

export interface GenerateMorphologyResult {
  results: GeneratedMorphology[];
  errors: string[];
}

type GenerateSingleDependency = (
  word: MorphologySeedWord,
  apiKeys: { gemini?: string; openai?: string },
) => Promise<GeneratedMorphology>;

const CONCURRENCY = 5;

// ---------- Prompt ----------

const SYSTEM_PROMPT = `あなたは英単語の語源（接頭語・接尾語・接中語・語根）の専門家です。与えられた英単語を形態素に分解し、JSONで返してください。

【ルール】
1. 提示された接辞候補リスト（id|綴り|種類|意味）の中から、実際にその単語の成り立ちに使われている接辞だけを選び、その id を affixId として返す
2. 候補リストにない接辞 id を作ってはいけない。候補に該当がない接辞・連結母音は affixId を省略してよい
3. 綴りが同じで意味が違う候補（例: un=否定 と uni=1つ）は、単語の本当の由来に合う方だけを選ぶ
4. 語根（root）は候補リストに関係なく自由に記述し、その意味を meaningJa に書く
5. parts は単語の先頭から順に並べる（prefix → root → suffix）
6. explanation はその単語の成り立ちのニュアンス解説のみ。最大2行・80字以内。訳語の羅列や例文は書かない
7. 接辞に分解できない単語（単一語根の語・固有名詞など）は hasMorphology を false にする

【出力形式】JSON
{
  "hasMorphology": true,
  "parts": [
    { "text": "un", "kind": "prefix", "meaningJa": "1つ", "affixId": "uni-one" },
    { "text": "anim", "kind": "root", "meaningJa": "心" },
    { "text": "ous", "kind": "suffix", "meaningJa": "形容詞化", "affixId": "ous-adj" }
  ],
  "explanation": "「心が1つ」が原義。全員の心が1つにそろう→「満場一致の」となった。"
}`;

export const MORPHOLOGY_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    hasMorphology: { type: 'BOOLEAN' },
    parts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          kind: { type: 'STRING', enum: [...MORPHOLOGY_PART_KINDS] },
          meaningJa: { type: 'STRING' },
          affixId: { type: 'STRING' },
        },
        required: ['text', 'kind', 'meaningJa'],
        propertyOrdering: ['text', 'kind', 'meaningJa', 'affixId'],
      },
    },
    explanation: { type: 'STRING' },
  },
  required: ['hasMorphology'],
  propertyOrdering: ['hasMorphology', 'parts', 'explanation'],
};

export function buildMorphologyPrompt(word: MorphologySeedWord): string {
  const candidateLines = word.candidates
    .map((sense) => `${sense.id}|${sense.form}|${sense.kind}|${sense.meaningJa}`)
    .join('\n');
  return `${SYSTEM_PROMPT}\n\n単語: "${word.english}"\n\n接辞候補リスト:\n${candidateLines}`;
}

// ---------- Validation ----------

class MorphologyGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MorphologyGenerationError';
  }
}

/**
 * AI 応答を検証して WordMorphology に変換する。
 * - affixId が指定されている part は、送った候補内の id でなければ失敗
 * - explanation は2行にクランプ
 */
export function toWordMorphology(
  raw: unknown,
  candidates: AffixSense[],
): WordMorphology | null {
  const parsed = morphologyAiResponseSchema.parse(raw);
  if (!parsed.hasMorphology) return null;

  const candidateIds = new Set(candidates.map((sense) => sense.id));
  const parts: WordMorphologyPart[] = [];
  for (const part of parsed.parts) {
    if (part.affixId !== undefined && !candidateIds.has(part.affixId)) {
      throw new MorphologyGenerationError(
        `AI returned affixId "${part.affixId}" that was not in the candidate list`,
      );
    }
    parts.push({
      text: part.text,
      kind: part.kind,
      meaningJa: part.meaningJa,
      ...(part.affixId !== undefined ? { affixId: part.affixId } : {}),
    });
  }

  // 接辞（root以外）が1つもなければ「構造なし」扱い
  if (!parts.some((part) => part.kind !== 'root')) return null;

  const explanation = clampExplanationLines(parsed.explanation).slice(0, 200);
  if (!explanation) return null;

  return { formula: parts, explanation, version: 1 };
}

// ---------- Core ----------

async function generateSingle(
  word: MorphologySeedWord,
  apiKeys: { gemini?: string; openai?: string },
): Promise<GeneratedMorphology> {
  const config = AI_CONFIG.defaults.openai;
  const provider = getProviderFromConfig(config, apiKeys);

  const aiResponse = await provider.generateText(buildMorphologyPrompt(word), {
    ...config,
    maxOutputTokens: 512,
    responseFormat: 'json',
    responseSchema: MORPHOLOGY_RESPONSE_SCHEMA,
  });

  if (!aiResponse.success) {
    throw new MorphologyGenerationError(
      `AI generation failed for "${word.english}": ${aiResponse.error}`,
    );
  }

  let raw: unknown;
  try {
    raw = parseJsonResponse(aiResponse.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    throw new MorphologyGenerationError(`Failed to parse morphology response: ${message}`);
  }

  return { english: word.english, morphology: toWordMorphology(raw, word.candidates) };
}

/**
 * 候補付き単語リストに対して語源解説を生成する。
 * 失敗した単語は1回だけリトライし、それでも失敗したら errors に積んでスキップ。
 */
export async function generateMorphology(
  words: MorphologySeedWord[],
  apiKeys: { gemini?: string; openai?: string },
  deps: { generateSingle?: GenerateSingleDependency } = {},
): Promise<GenerateMorphologyResult> {
  if (words.length === 0) return { results: [], errors: [] };

  const generateSingleWord = deps.generateSingle ?? generateSingle;
  const results: GeneratedMorphology[] = [];
  const errors: string[] = [];
  const firstPassFailures: MorphologySeedWord[] = [];

  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((word) => generateSingleWord(word, apiKeys)),
    );
    for (const [index, result] of settled.entries()) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        firstPassFailures.push(chunk[index]!);
      }
    }
  }

  if (firstPassFailures.length > 0) {
    console.log(`[generate-morphology] Retrying ${firstPassFailures.length} failed words`);
    for (let i = 0; i < firstPassFailures.length; i += CONCURRENCY) {
      const chunk = firstPassFailures.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map((word) => generateSingleWord(word, apiKeys)),
      );
      for (const [index, result] of settled.entries()) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : 'Unknown error';
          const message = `${chunk[index]!.english}: ${reason}`;
          console.error('[generate-morphology] Retry failed:', message);
          errors.push(message);
        }
      }
    }
  }

  return { results, errors };
}

export const __internal = {
  generateSingle,
  buildMorphologyPrompt,
  toWordMorphology,
};
