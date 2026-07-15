import { AI_CONFIG, type AIModelConfig, type ResponseSchema, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig, isCloudRunConfigured } from '@/lib/ai/providers';
import {
  LEXICON_POS_VALUES,
  normalizeHeadword,
  normalizeLexiconTranslation,
  type LexiconPos,
} from '../../../shared/lexicon';
import type { TranslatedSense, ValidatedTranslationCandidate } from './types';
import { z } from 'zod';
import { JAPANESE_PARENTHESIS_RULES } from '@/lib/ai/prompts/japanese-format';

/** 1語あたり保存する senses の上限（トークン増を抑える）。 */
export const MAX_TRANSLATED_SENSES = 4;

const TRANSLATION_PROMPT = `あなたは英和辞典です。与えられた英単語・フレーズの日本語訳を、意味（語義）ごとに返してください。

ルール:
- 出力はJSONのみで返してください
- 多義語は主要な意味を意味ごとに分けて返す（最大3件まで・重要な順）
- 一般的な意味が1つしかない語は senses を1件だけ返す（無理に増やさない）
- isPrimary は最も一般的な意味1件だけ true にする
- meaningSummary はその意味の短い説明（10文字程度）。不要なら null
- 動詞の場合は「〜する」の形を優先する
- 不要な説明や引用符は付けない
${JAPANESE_PARENTHESIS_RULES}

出力形式:
{
  "senses": [
    { "japanese": "走る", "meaningSummary": "移動する", "isPrimary": true },
    { "japanese": "経営する", "meaningSummary": "組織を運営する", "isPrimary": false }
  ]
}`;

const TRANSLATION_HINT_VALIDATION_PROMPT = `あなたは英和辞典の品質チェッカーです。
与えられた英語・品詞・日本語候補について、その日本語候補を共有語彙マスタへ保存してよいか厳密に判定してください。

判定ルール:
- useHint は、その日本語候補が英語の主要で自然な訳として妥当な場合にだけ true
- OCRノイズ、誤読、無関係、品詞不一致、不自然、意味がズレている場合は false
- useHint=true のとき normalizedJapanese に保存用の簡潔な日本語訳を入れる
- useHint=false のとき normalizedJapanese は null
- useHint=false でも、より自然な主要訳が分かるなら suggestedJapanese に入れる
- suggestedJapanese が不明な場合は null
${JAPANESE_PARENTHESIS_RULES}
- 出力はJSONのみ

出力形式:
{
  "results": [
    {
      "english": "word",
      "pos": "noun",
      "japaneseHint": "候補",
      "useHint": true,
      "normalizedJapanese": "保存してよい日本語訳 or null",
      "suggestedJapanese": "hintを使わない場合の代替訳 or null"
    }
  ]
}`;

const PART_OF_SPEECH_CLASSIFICATION_PROMPT = `あなたは英和辞典の品詞分類器です。
与えられた英単語・フレーズと日本語候補から、共有語彙マスタで使う主品詞を1つだけ厳密に決めてください。

品詞候補:
- noun
- verb
- adjective
- adverb
- idiom
- phrasal_verb
- preposition
- conjunction
- pronoun
- determiner
- interjection
- auxiliary
- other

判定ルール:
- 出力は JSON のみ
- 1 項目につき pos は必ず 1 つだけ返す
- 熟語は idiom、句動詞は phrasal_verb を優先する
- be / do / have / modal auxiliary は auxiliary にする
- 日本語候補がある場合は意味と品詞の整合を優先する
- 日本語候補がなくても、最も一般的な辞書上の主品詞を返す
- 不明な場合のみ other にする

出力形式:
{
  "results": [
    {
      "english": "word",
      "japaneseHint": "候補 or null",
      "pos": "noun"
    }
  ]
}`;

const translatedSenseSchema = z.object({
  japanese: z.string().trim().min(1),
  meaningSummary: z.string().trim().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

const translationResponseSchema = z.object({
  senses: z.array(translatedSenseSchema),
});

// 旧形式（単一訳）のフォールバック。モデルが旧形式で返した場合も受理する。
const legacyTranslationResponseSchema = z.object({
  japanese: z.string().trim().min(1),
});

const batchTranslationResponseSchema = z.object({
  translations: z.array(z.object({
    english: z.string().trim().min(1),
    pos: z.string().trim().min(1),
    senses: z.array(translatedSenseSchema).nullable().optional(),
    // 旧形式フォールバック
    japanese: z.string().trim().nullable().optional(),
  })),
});

/**
 * AIが返した senses を保存用に正規化する。
 * - 日本語訳を正規化し、空・重複を除去
 * - 件数を MAX_TRANSLATED_SENSES に制限
 * - isPrimary をちょうど1件にする（無ければ先頭を primary に昇格）
 */
export function normalizeTranslatedSenses(
  senses: Array<{ japanese: string; meaningSummary?: string | null; isPrimary?: boolean }>,
): TranslatedSense[] {
  const seen = new Set<string>();
  const normalized: TranslatedSense[] = [];

  for (const sense of senses) {
    const japanese = normalizeLexiconTranslation(sense.japanese);
    if (!japanese || seen.has(japanese)) continue;
    seen.add(japanese);
    normalized.push({
      japanese,
      meaningSummary: normalizeLexiconTranslation(sense.meaningSummary) ?? null,
      isPrimary: sense.isPrimary === true,
    });
    if (normalized.length >= MAX_TRANSLATED_SENSES) break;
  }

  if (normalized.length === 0) return [];

  const primaryIndex = normalized.findIndex((sense) => sense.isPrimary);
  return normalized.map((sense, index) => ({
    ...sense,
    isPrimary: index === (primaryIndex === -1 ? 0 : primaryIndex),
  }));
}

export function primaryTranslation(senses: TranslatedSense[]): string | null {
  return senses.find((sense) => sense.isPrimary)?.japanese ?? senses[0]?.japanese ?? null;
}

const batchValidationResponseSchema = z.object({
  results: z.array(z.object({
    english: z.string().trim().min(1),
    pos: z.string().trim().min(1),
    japaneseHint: z.string().trim().min(1),
    useHint: z.boolean(),
    normalizedJapanese: z.string().trim().nullable().optional(),
    suggestedJapanese: z.string().trim().nullable().optional(),
  }).strict()),
}).strict();

const batchPosClassificationResponseSchema = z.object({
  results: z.array(z.object({
    english: z.string().trim().min(1),
    japaneseHint: z.string().trim().nullable().optional(),
    pos: z.enum(LEXICON_POS_VALUES),
  }).strict()),
}).strict();

/** Gemini Controlled Generation schema mirroring `batchPosClassificationResponseSchema`. */
export const POS_CLASSIFICATION_RESPONSE_SCHEMA: ResponseSchema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          english: { type: 'STRING' },
          japaneseHint: { type: 'STRING', nullable: true },
          pos: { type: 'STRING', enum: [...LEXICON_POS_VALUES] },
        },
        required: ['english', 'pos'],
        propertyOrdering: ['english', 'japaneseHint', 'pos'],
      },
    },
  },
  required: ['results'],
};

type LexiconAIKind = 'translate' | 'validateHint' | 'classifyPos';

function getLexiconAIClient(
  kind: LexiconAIKind,
): { provider: ReturnType<typeof getProviderFromConfig>; config: AIModelConfig } | null {
  const apiKeys = getAPIKeys();

  if (!isCloudRunConfigured() && !apiKeys.gemini) {
    return null;
  }

  const config = kind === 'translate'
    ? AI_CONFIG.lexicon.translate
    : kind === 'validateHint'
      ? AI_CONFIG.lexicon.validateHint
      : AI_CONFIG.lexicon.classifyPos;

  return {
    provider: getProviderFromConfig(config, apiKeys),
    config,
  };
}

export function buildLexiconKey(english: string, pos: LexiconPos): string {
  return `${normalizeHeadword(english)}::${pos}`;
}

export function buildValidationKey(
  english: string,
  pos: LexiconPos,
  japaneseHint: string,
): string {
  return `${buildLexiconKey(english, pos)}::${normalizeLexiconTranslation(japaneseHint) ?? ''}`;
}

export function buildPosClassificationKey(
  english: string,
  japaneseHint?: string | null,
): string {
  return `${normalizeHeadword(english)}::${normalizeLexiconTranslation(japaneseHint) ?? ''}`;
}

export function extractJsonContent(content: string): string {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  const jsonStartIndex = content.indexOf('{');
  const jsonEndIndex = content.lastIndexOf('}');
  if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
    return content.slice(jsonStartIndex, jsonEndIndex + 1);
  }

  return content;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function looksLikeJapaneseTranslation(text: string, english: string): boolean {
  const normalizedEnglish = normalizeHeadword(english);
  const normalizedText = normalizeHeadword(text);
  if (!normalizedText || normalizedText === normalizedEnglish) {
    return false;
  }

  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

/**
 * 1語の日本語訳を意味（sense）ごとに生成する。多義語は複数senseを返す。
 */
export async function translateWordSensesWithAI(
  english: string,
  _pos: LexiconPos,
): Promise<TranslatedSense[]> {
  const aiClient = getLexiconAIClient('translate');
  if (!aiClient) {
    return [];
  }

  const result = await aiClient.provider.generateText(`${TRANSLATION_PROMPT}\n\n英語: ${english}`, {
    ...aiClient.config,
    maxOutputTokens: 512,
    responseFormat: 'json',
  });
  if (!result.success) {
    return [];
  }

  const content = extractJsonContent(result.content);
  try {
    const parsed = translationResponseSchema.parse(JSON.parse(content));
    return normalizeTranslatedSenses(parsed.senses);
  } catch {
    // 旧形式（単一訳）・プレーンテキストのフォールバック
    try {
      const legacy = legacyTranslationResponseSchema.parse(JSON.parse(content));
      return normalizeTranslatedSenses([{ japanese: legacy.japanese, isPrimary: true }]);
    } catch {
      const fallback = normalizeLexiconTranslation(result.content);
      return fallback
        ? [{ japanese: fallback, meaningSummary: null, isPrimary: true }]
        : [];
    }
  }
}

export async function translateWithAI(english: string, pos: LexiconPos): Promise<string | null> {
  const senses = await translateWordSensesWithAI(english, pos);
  return primaryTranslation(senses);
}

/**
 * 複数語の日本語訳を意味（sense）ごとにバッチ生成する。多義語対応版。
 */
export async function translateWordsSensesWithAI(
  inputs: Array<{ english: string; pos: LexiconPos }>,
): Promise<Map<string, TranslatedSense[]>> {
  const aiClient = getLexiconAIClient('translate');
  const uniqueInputs = new Map<string, { english: string; pos: LexiconPos }>();

  for (const input of inputs) {
    const english = input.english.trim();
    if (!english) continue;
    const key = buildLexiconKey(english, input.pos);
    if (!uniqueInputs.has(key)) {
      uniqueInputs.set(key, { english, pos: input.pos });
    }
  }

  const results = new Map<string, TranslatedSense[]>();
  for (const key of uniqueInputs.keys()) {
    results.set(key, []);
  }

  if (!aiClient || uniqueInputs.size === 0) {
    return results;
  }

  const items = Array.from(uniqueInputs.values());
  const prompt = `あなたは英和辞典です。複数の英単語・フレーズの日本語訳を、意味（語義）ごとに返してください。

ルール:
- 出力はJSONのみ
- 多義語は主要な意味を意味ごとに分けて返す（1語あたり最大3件・重要な順）
- 一般的な意味が1つしかない語は senses を1件だけ返す（無理に増やさない）
- 各語の isPrimary は最も一般的な意味1件だけ true にする
- meaningSummary はその意味の短い説明（10文字程度）。不要なら null
- 動詞は「〜する」の形を優先する
- 不明な場合は senses を null にする
- 説明文や前置きは禁止
${JAPANESE_PARENTHESIS_RULES}

出力形式:
{
  "translations": [
    {
      "english": "run",
      "pos": "verb",
      "senses": [
        { "japanese": "走る", "meaningSummary": "移動する", "isPrimary": true },
        { "japanese": "経営する", "meaningSummary": "組織を運営する", "isPrimary": false }
      ]
    }
  ]
}

対象一覧:
${items.map((item, index) => `${index + 1}. english: ${item.english}, pos: ${item.pos}`).join('\n')}`;

  const result = await aiClient.provider.generateText(prompt, {
    ...aiClient.config,
    maxOutputTokens: Math.min(8192, Math.max(1024, items.length * 220)),
    responseFormat: 'json',
  });

  if (!result.success || !result.content?.trim()) {
    return results;
  }

  try {
    const parsed = batchTranslationResponseSchema.parse(JSON.parse(extractJsonContent(result.content)));
    for (const item of parsed.translations) {
      const key = buildLexiconKey(item.english, item.pos as LexiconPos);
      if (!results.has(key)) continue;
      if (item.senses && item.senses.length > 0) {
        results.set(key, normalizeTranslatedSenses(item.senses));
      } else if (item.japanese) {
        // 旧形式（単一訳）フォールバック
        results.set(key, normalizeTranslatedSenses([{ japanese: item.japanese, isPrimary: true }]));
      }
    }
  } catch {
    return results;
  }

  return results;
}

export async function translateWordsWithAI(
  inputs: Array<{ english: string; pos: LexiconPos }>,
): Promise<Map<string, string | null>> {
  const senseMap = await translateWordsSensesWithAI(inputs);
  const results = new Map<string, string | null>();
  for (const [key, senses] of senseMap) {
    results.set(key, primaryTranslation(senses));
  }
  return results;
}

export async function validateTranslationCandidatesWithAI(
  inputs: Array<{ english: string; pos: LexiconPos; japaneseHint: string }>,
): Promise<Map<string, ValidatedTranslationCandidate | null>> {
  const uniqueInputs = new Map<string, { english: string; pos: LexiconPos; japaneseHint: string }>();

  for (const input of inputs) {
    const english = input.english.trim();
    const japaneseHint = normalizeLexiconTranslation(input.japaneseHint);
    if (!english || !japaneseHint) continue;
    const key = buildValidationKey(english, input.pos, japaneseHint);
    if (!uniqueInputs.has(key)) {
      uniqueInputs.set(key, { english, pos: input.pos, japaneseHint });
    }
  }

  const results = new Map<string, ValidatedTranslationCandidate | null>();
  for (const [key, value] of uniqueInputs) {
    if (!looksLikeJapaneseTranslation(value.japaneseHint, value.english)) {
      results.set(key, {
        useHint: false,
        normalizedJapanese: null,
        suggestedJapanese: null,
      });
      continue;
    }
    results.set(key, null);
  }

  const pending = Array.from(uniqueInputs.entries())
    .filter(([key]) => results.get(key) === null)
    .map(([, value]) => value);
  const aiClient = getLexiconAIClient('validateHint');

  if (!aiClient || pending.length === 0) {
    return results;
  }

  for (const chunk of chunkArray(pending, 50)) {
    const prompt = `${TRANSLATION_HINT_VALIDATION_PROMPT}

対象一覧:
${chunk.map((item, index) => `${index + 1}. 英語: ${item.english} / 品詞: ${item.pos} / 日本語候補: ${item.japaneseHint}`).join('\n')}`;

    const result = await aiClient.provider.generateText(prompt, {
      ...aiClient.config,
      maxOutputTokens: Math.min(8192, Math.max(1024, chunk.length * 140)),
      responseFormat: 'json',
    });
    if (!result.success || !result.content?.trim()) {
      continue;
    }

    try {
      const parsed = batchValidationResponseSchema.parse(JSON.parse(extractJsonContent(result.content)));
      for (const item of parsed.results) {
        const key = buildValidationKey(
          item.english,
          item.pos as LexiconPos,
          item.japaneseHint,
        );
        if (!results.has(key)) continue;
        results.set(key, {
          useHint: item.useHint,
          normalizedJapanese: normalizeLexiconTranslation(item.normalizedJapanese),
          suggestedJapanese: normalizeLexiconTranslation(item.suggestedJapanese),
        });
      }
    } catch (error) {
      console.warn('Failed to parse translation hint batch validation response:', error);
    }
  }

  return results;
}

export async function classifyPartOfSpeechBatchWithAI(
  inputs: Array<{ english: string; japaneseHint?: string | null }>,
): Promise<Map<string, LexiconPos>> {
  const aiClient = getLexiconAIClient('classifyPos');
  const uniqueInputs = new Map<string, { english: string; japaneseHint: string | null }>();

  for (const input of inputs) {
    const english = input.english.trim();
    if (!english) continue;
    const japaneseHint = normalizeLexiconTranslation(input.japaneseHint);
    const key = buildPosClassificationKey(english, japaneseHint);
    if (!uniqueInputs.has(key)) {
      uniqueInputs.set(key, { english, japaneseHint });
    }
  }

  const results = new Map<string, LexiconPos>();
  for (const key of uniqueInputs.keys()) {
    results.set(key, 'other');
  }

  if (!aiClient || uniqueInputs.size === 0) {
    return results;
  }

  for (const chunk of chunkArray(Array.from(uniqueInputs.values()), 50)) {
    const prompt = `${PART_OF_SPEECH_CLASSIFICATION_PROMPT}

対象一覧:
${chunk.map((item, index) => (
      `${index + 1}. english: ${item.english}, japaneseHint: ${item.japaneseHint ?? 'null'}`
    )).join('\n')}`;

    const result = await aiClient.provider.generateText(prompt, {
      ...aiClient.config,
      maxOutputTokens: Math.min(8192, Math.max(768, chunk.length * 72)),
      responseFormat: 'json',
      responseSchema: POS_CLASSIFICATION_RESPONSE_SCHEMA,
    });

    if (!result.success || !result.content?.trim()) {
      continue;
    }

    try {
      const parsed = batchPosClassificationResponseSchema.parse(JSON.parse(extractJsonContent(result.content)));
      for (const item of parsed.results) {
        const key = buildPosClassificationKey(item.english, item.japaneseHint);
        if (!results.has(key)) continue;
        results.set(key, item.pos);
      }
    } catch {
      continue;
    }
  }

  return results;
}
