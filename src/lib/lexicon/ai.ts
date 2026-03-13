import { AI_CONFIG, type AIModelConfig, getAPIKeys } from '@/lib/ai/config';
import { getProviderFromConfig, isCloudRunConfigured } from '@/lib/ai/providers';
import {
  normalizeHeadword,
  normalizeLexiconTranslation,
  type LexiconPos,
} from '../../../shared/lexicon';
import type { ValidatedTranslationCandidate } from './types';
import { z } from 'zod';

const TRANSLATION_PROMPT = `あなたは英和辞典です。与えられた英単語・フレーズの日本語訳を返してください。

ルール:
- 出力はJSONのみで返してください
- 複数の意味がある場合は最も一般的な訳を1つ返す
- 動詞の場合は「〜する」の形を優先する
- 不要な説明や引用符は付けない

出力形式:
{
  "japanese": "日本語訳"
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

const translationResponseSchema = z.object({
  japanese: z.string().trim().min(1),
}).strict();

const batchTranslationResponseSchema = z.object({
  translations: z.array(z.object({
    english: z.string().trim().min(1),
    pos: z.string().trim().min(1),
    japanese: z.string().trim().nullable().optional(),
  }).strict()),
}).strict();

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

type LexiconAIKind = 'translate' | 'validateHint';

function getLexiconAIClient(
  kind: LexiconAIKind,
): { provider: ReturnType<typeof getProviderFromConfig>; config: AIModelConfig } | null {
  const apiKeys = getAPIKeys();

  if (!isCloudRunConfigured() && !apiKeys.gemini) {
    return null;
  }

  const config = kind === 'translate'
    ? AI_CONFIG.lexicon.translate
    : AI_CONFIG.lexicon.validateHint;

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

export async function translateWithAI(english: string, _pos: LexiconPos): Promise<string | null> {
  const aiClient = getLexiconAIClient('translate');
  if (!aiClient) {
    return null;
  }

  const result = await aiClient.provider.generateText(`${TRANSLATION_PROMPT}\n\n英語: ${english}`, {
    ...aiClient.config,
    maxOutputTokens: 256,
    responseFormat: 'json',
  });
  if (!result.success) {
    return null;
  }

  try {
    const parsed = translationResponseSchema.parse(JSON.parse(extractJsonContent(result.content)));
    return normalizeLexiconTranslation(parsed.japanese);
  } catch {
    return normalizeLexiconTranslation(result.content);
  }
}

export async function translateWordsWithAI(
  inputs: Array<{ english: string; pos: LexiconPos }>,
): Promise<Map<string, string | null>> {
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

  const results = new Map<string, string | null>();
  for (const key of uniqueInputs.keys()) {
    results.set(key, null);
  }

  if (!aiClient || uniqueInputs.size === 0) {
    return results;
  }

  const items = Array.from(uniqueInputs.values());
  const prompt = `あなたは英和辞典です。複数の英単語・フレーズの主要な日本語訳を返してください。

ルール:
- 出力はJSONのみ
- 各項目について最も一般的な日本語訳を1つだけ返す
- 動詞は「〜する」の形を優先する
- 不明な場合は japanese を null にする
- 説明文や前置きは禁止

出力形式:
{
  "translations": [
    { "english": "word", "pos": "noun", "japanese": "日本語訳 or null" }
  ]
}

対象一覧:
${items.map((item, index) => `${index + 1}. english: ${item.english}, pos: ${item.pos}`).join('\n')}`;

  const result = await aiClient.provider.generateText(prompt, {
    ...aiClient.config,
    maxOutputTokens: Math.min(8192, Math.max(768, items.length * 96)),
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
      results.set(key, normalizeLexiconTranslation(item.japanese));
    }
  } catch {
    return results;
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
