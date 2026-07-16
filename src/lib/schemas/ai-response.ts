import { z } from 'zod';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { EXTRACT_MODES, normalizeExtractModes } from '@/lib/scan/mode-provider';
import { normalizeSourceLabels } from '../../../shared/source-labels';
import {
  TRANSLATION_NOTES_SECTION_ID,
  mergeTranslationNoteSection,
  normalizeWordTranslationPayload,
} from '../../../shared/word-translations';
import type { CustomSection, WordTranslation } from '../../../shared/types';

// Zod schema for validating OpenAI API response
// This ensures robustness against malformed AI outputs

export const AIWordSchema = z.object({
  english: z.string(),
  japanese: z.string().optional().default(''),
  rawJapanese: z.string().optional(),
  translations: z.array(z.union([
    z.string(),
    z.object({
      japanese: z.string().optional(),
      translationJa: z.string().optional(),
      translation_ja: z.string().optional(),
      source: z.string().optional(),
      japaneseSource: z.string().optional(),
      annotationRanges: z.array(z.string()).optional(),
      annotation_ranges: z.array(z.string()).optional(),
      lexiconSenseId: z.string().optional(),
      lexicon_sense_id: z.string().optional(),
      meaningRank: z.number().int().min(1).optional(),
      meaning_rank: z.number().int().min(1).optional(),
    }).passthrough(),
  ])).optional(),
  japaneseSource: z.string().optional(),
  lexiconSenseId: z.string().optional(),
  sourceModes: z.array(z.enum(EXTRACT_MODES)).nullish(),
  distractors: z.array(z.string()).default([]),
  partOfSpeechTags: z.array(z.string()).nullish().transform((tags) => tags ?? []),
  customSections: z.unknown().optional(),
  // Optional example sentence fields (Pro feature)
  exampleSentence: z.string().optional().nullable(),
  exampleSentenceJa: z.string().optional().nullable(),
}).transform((word) => {
  const {
    japaneseSource: rawJapaneseSource,
    rawJapanese,
    translations: rawTranslations,
    customSections: rawCustomSections,
    sourceModes: rawSourceModes,
    exampleSentence: rawExampleSentence,
    exampleSentenceJa: rawExampleSentenceJa,
    ...rest
  } = word;
  const translationPayload = normalizeWordTranslationPayload({
    translations: rawTranslations,
    japanese: word.japanese,
    rawJapanese,
    japaneseSource: rawJapaneseSource,
    lexiconSenseId: word.lexiconSenseId,
    customSections: rawCustomSections,
  });
  const sourceModes = normalizeExtractModes(rawSourceModes, []);
  return {
    ...rest,
    english: word.english || '---',
    japanese: translationPayload.japanese,
    // Keep distractors as-is (empty array if not provided, will be generated on quiz start)
    distractors: word.distractors,
    partOfSpeechTags: normalizePartOfSpeechTags(word.partOfSpeechTags),
    ...(translationPayload.translations.length > 0 ? { translations: translationPayload.translations } : {}),
    ...(sourceModes.length > 0 ? { sourceModes } : {}),
    ...(rawExampleSentence ? { exampleSentence: rawExampleSentence } : {}),
    ...(rawExampleSentenceJa ? { exampleSentenceJa: rawExampleSentenceJa } : {}),
    ...(translationPayload.customSections ? { customSections: translationPayload.customSections } : {}),
    ...(translationPayload.japanese && translationPayload.japaneseSource ? { japaneseSource: translationPayload.japaneseSource } : {}),
  };
});

type TransformedAIWord = z.output<typeof AIWordSchema>;

function mergeWordTranslationLists(
  first: readonly WordTranslation[],
  second: readonly WordTranslation[],
): WordTranslation[] {
  const merged: WordTranslation[] = [];
  const seen = new Set<string>();
  for (const translation of [...first, ...second]) {
    const key = translation.translationJa.toLowerCase();
    if (!translation.translationJa || seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...translation,
      meaningRank: merged.length + 1,
      position: merged.length,
      isPrimary: merged.length === 0,
    });
  }
  return merged;
}

function mergeCustomSectionLists(
  first: CustomSection[] | undefined,
  second: CustomSection[] | undefined,
): CustomSection[] | undefined {
  if (!first?.length) return second?.length ? second : undefined;
  if (!second?.length) return first;

  let merged = [...first];
  for (const section of second) {
    if (section.id === TRANSLATION_NOTES_SECTION_ID) {
      merged = mergeTranslationNoteSection(merged, section.content.split('\n')) ?? merged;
      continue;
    }
    if (!merged.some((existing) => existing.id === section.id)) {
      merged.push(section);
    }
  }
  return merged;
}

function mergeDuplicateHeadwordPair(first: TransformedAIWord, second: TransformedAIWord): TransformedAIWord {
  const translations = mergeWordTranslationLists(first.translations ?? [], second.translations ?? []);
  const japanese = translations[0]?.translationJa ?? '';
  const primarySource = translations[0]?.source;
  const japaneseSource = primarySource === 'scan' || primarySource === 'ai' ? primarySource : undefined;
  const sourceModes = normalizeExtractModes([...(first.sourceModes ?? []), ...(second.sourceModes ?? [])], []);
  const customSections = mergeCustomSectionLists(first.customSections, second.customSections);
  const exampleSentence = first.exampleSentence ?? second.exampleSentence;
  const exampleSentenceJa = first.exampleSentenceJa ?? second.exampleSentenceJa;

  return {
    english: first.english,
    japanese,
    ...(first.lexiconSenseId ? { lexiconSenseId: first.lexiconSenseId } : {}),
    distractors: first.distractors.length > 0 ? first.distractors : second.distractors,
    partOfSpeechTags: normalizePartOfSpeechTags([...first.partOfSpeechTags, ...second.partOfSpeechTags]),
    ...(translations.length > 0 ? { translations } : {}),
    ...(sourceModes.length > 0 ? { sourceModes } : {}),
    ...(exampleSentence ? { exampleSentence } : {}),
    ...(exampleSentenceJa ? { exampleSentenceJa } : {}),
    ...(customSections ? { customSections } : {}),
    ...(japanese && japaneseSource ? { japaneseSource } : {}),
  };
}

// 画像内で同じ見出し語が複数エントリに分かれて返ってきた場合（多義語）の
// 決定的マージ。プロンプト側でも統合を指示しているが、AI出力は信頼できない
// ため最終的にここで1エントリへ統合する。
export function mergeDuplicateHeadwords(words: TransformedAIWord[]): TransformedAIWord[] {
  const wordMap = new Map<string, TransformedAIWord>();
  const order: string[] = [];

  for (const word of words) {
    const key = word.english.trim().toLowerCase();
    // english が読み取れなかったプレースホルダは統合対象にしない
    if (!key || key === '---') {
      const uniqueKey = `__unmergeable_${order.length}`;
      wordMap.set(uniqueKey, word);
      order.push(uniqueKey);
      continue;
    }

    const existing = wordMap.get(key);
    if (!existing) {
      wordMap.set(key, word);
      order.push(key);
      continue;
    }
    wordMap.set(key, mergeDuplicateHeadwordPair(existing, word));
  }

  return order.map((key) => wordMap.get(key)!);
}

export const AIResponseSchema = z.object({
  words: z.array(AIWordSchema).default([]),
  sourceLabels: z.array(z.string()).default([]).transform((labels) => normalizeSourceLabels(labels)),
}).transform((response) => ({
  ...response,
  words: mergeDuplicateHeadwords(response.words),
}));

export type ValidatedAIResponse = z.infer<typeof AIResponseSchema>;
export type ValidatedAIWord = z.infer<typeof AIWordSchema>;

// Safe parser that returns result with error info
export function parseAIResponse(data: unknown): {
  success: boolean;
  data?: ValidatedAIResponse;
  error?: string;
} {
  const result = AIResponseSchema.safeParse(data);

  if (result.success) {
    const count = result.data.words.length;
    if (count === 0) {
      console.warn('parseAIResponse parsed valid JSON but no words were extracted');
    } else {
      console.log(`parseAIResponse success: extracted ${count} words`);
    }
    return { success: true, data: result.data };
  }

  // Format Zod errors for user-friendly display
  const errorMessages = result.error.issues
    .map((e) => `${e.path.join('.')}: ${e.message}`)
    .join(', ');

  console.error('parseAIResponse error:', errorMessages);
  console.error('Zod issues:', JSON.stringify(result.error.issues, null, 2));

  return { success: false, error: 'AIの応答形式が不正です。もう一度お試しください。' };
}
