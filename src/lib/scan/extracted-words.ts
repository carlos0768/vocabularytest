// スキャンジョブで AI が返した単語の正規化・重複統合。
// `src/app/api/scan-jobs/process/route.ts` の processJobById から使う。
import type { CustomSection, WordMorphology, WordTranslation } from '@/types';
import {
  applySourceModesFromScanModes,
  normalizeExtractModes,
  type ExtractMode,
} from '@/lib/scan/mode-provider';
import { normalizeWordForTranslationPersistence } from '@/lib/words/translation-persistence';
import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';

export type ExtractionLikeResult =
  | { success: true; data: { words: unknown[]; sourceLabels?: unknown[] } }
  | { success: false; error: string; reason?: string };

export interface ProcessedExtractedWord {
  english: string;
  japanese: string;
  rawJapanese?: string;
  translations?: WordTranslation[];
  japaneseSource?: 'scan' | 'ai';
  sourceModes?: ExtractMode[];
  lexiconEntryId?: string;
  lexiconSenseId?: string;
  lexiconDistinctKey?: string;
  lexiconSenseIsPrimary?: boolean;
  cefrLevel?: string;
  distractors: string[];
  partOfSpeechTags?: string[];
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  customSections?: CustomSection[];
  morphology?: WordMorphology;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function firstNonEmpty(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeJapaneseSource(value: unknown): 'scan' | 'ai' | undefined {
  return value === 'scan' || value === 'ai' ? value : undefined;
}

function preferJapaneseSource(
  first?: 'scan' | 'ai',
  second?: 'scan' | 'ai',
): 'scan' | 'ai' | undefined {
  if (first === 'scan' || second === 'scan') return 'scan';
  if (first === 'ai' || second === 'ai') return 'ai';
  return undefined;
}

function normalizeSourceModes(value: unknown, fallback: ExtractMode[] = []): ExtractMode[] | undefined {
  const normalized = normalizeExtractModes(value, fallback);
  return normalized.length > 0 ? normalized : undefined;
}

function mergeExtractSourceModes(
  first?: ExtractMode[],
  second?: ExtractMode[],
): ExtractMode[] | undefined {
  return normalizeSourceModes([...(first ?? []), ...(second ?? [])], []);
}

export function applySourceModesToExtractionResult(
  result: ExtractionLikeResult,
  modes: ExtractMode[],
): ExtractionLikeResult {
  if (!result.success) return result;

  return {
    ...result,
    data: {
      ...result.data,
      words: applySourceModesFromScanModes(result.data.words, modes),
    },
  };
}

function mergeDistractors(existing: string[], incoming: unknown): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const incomingList = Array.isArray(incoming) ? incoming : [];

  for (const candidate of [...existing, ...incomingList]) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    const token = normalized.toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);
    merged.push(normalized);
    if (merged.length >= 3) break;
  }

  return merged;
}

export function parseExtractedWords(rawWords: unknown[]): ProcessedExtractedWord[] {
  const parsed: ProcessedExtractedWord[] = [];

  for (const rawWord of rawWords) {
    if (!rawWord || typeof rawWord !== 'object') continue;

    const word = rawWord as Record<string, unknown>;
    const english = normalizeText(word.english);
    const japanese = normalizeText(word.japanese);
    if (!english) continue;
    // Filter out placeholder/invalid Japanese translations
    const INVALID_JAPANESE = ['unknown', '不明', 'n/a', '-', '---'];
    const normalizedJapanese = INVALID_JAPANESE.includes(japanese.toLowerCase()) ? '' : japanese;
    const normalizedWord = normalizeWordForTranslationPersistence({
      english,
      japanese: normalizedJapanese,
      rawJapanese: firstNonEmpty(word.rawJapanese),
      translations: word.translations,
      japaneseSource: normalizedJapanese ? normalizeJapaneseSource(word.japaneseSource) : undefined,
      sourceModes: normalizeSourceModes(word.sourceModes, []),
      lexiconSenseId: firstNonEmpty(word.lexiconSenseId),
      distractors: mergeDistractors([], word.distractors),
      partOfSpeechTags: normalizePartOfSpeechTags(word.partOfSpeechTags),
      pronunciation: firstNonEmpty(word.pronunciation),
      exampleSentence: firstNonEmpty(word.exampleSentence),
      exampleSentenceJa: firstNonEmpty(word.exampleSentenceJa),
      customSections: word.customSections,
    });

    parsed.push(normalizedWord);
  }

  return parsed;
}

export function dedupeExtractedWords(
  words: ProcessedExtractedWord[],
  sourceModesOverride?: ExtractMode[],
): ProcessedExtractedWord[] {
  if (words.length === 0) return [];

  const normalizedSourceModesOverride = sourceModesOverride
    ? normalizeExtractModes(sourceModesOverride)
    : undefined;
  const deduped: ProcessedExtractedWord[] = [];
  const indexByKey = new Map<string, number>();

  for (const source of words) {
    const key = `${source.english.toLowerCase()}||${source.japanese}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, deduped.length);
      deduped.push({
        english: source.english,
        japanese: source.japanese,
        rawJapanese: source.rawJapanese,
        translations: source.translations,
        japaneseSource: source.japaneseSource,
        lexiconEntryId: source.lexiconEntryId,
        lexiconSenseId: source.lexiconSenseId,
        lexiconDistinctKey: source.lexiconDistinctKey,
        lexiconSenseIsPrimary: source.lexiconSenseIsPrimary,
        sourceModes: normalizedSourceModesOverride
          ? [...normalizedSourceModesOverride]
          : source.sourceModes,
        distractors: mergeDistractors([], source.distractors),
        partOfSpeechTags: normalizePartOfSpeechTags(source.partOfSpeechTags),
        pronunciation: firstNonEmpty(source.pronunciation),
        exampleSentence: firstNonEmpty(source.exampleSentence),
        exampleSentenceJa: firstNonEmpty(source.exampleSentenceJa),
        customSections: source.customSections,
      });
      continue;
    }

    const existing = deduped[existingIndex];
    deduped[existingIndex] = {
      english: existing.english,
      japanese: existing.japanese,
      rawJapanese: existing.rawJapanese ?? source.rawJapanese,
      translations: existing.translations && existing.translations.length > 0
        ? existing.translations
        : source.translations,
      japaneseSource: preferJapaneseSource(existing.japaneseSource, source.japaneseSource),
      lexiconEntryId: existing.lexiconEntryId ?? source.lexiconEntryId,
      lexiconSenseId: existing.lexiconSenseId ?? source.lexiconSenseId,
      lexiconDistinctKey: existing.lexiconDistinctKey ?? source.lexiconDistinctKey,
      lexiconSenseIsPrimary: existing.lexiconSenseIsPrimary ?? source.lexiconSenseIsPrimary,
      sourceModes: normalizedSourceModesOverride
        ? [...normalizedSourceModesOverride]
        : mergeExtractSourceModes(existing.sourceModes, source.sourceModes),
      distractors: mergeDistractors(existing.distractors, source.distractors),
      partOfSpeechTags: normalizePartOfSpeechTags([
        ...(existing.partOfSpeechTags ?? []),
        ...(source.partOfSpeechTags ?? []),
      ]),
      pronunciation: existing.pronunciation ?? firstNonEmpty(source.pronunciation),
      exampleSentence: existing.exampleSentence ?? firstNonEmpty(source.exampleSentence),
      exampleSentenceJa: existing.exampleSentenceJa ?? firstNonEmpty(source.exampleSentenceJa),
      customSections: existing.customSections ?? source.customSections,
    };
  }

  return deduped;
}
