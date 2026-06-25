import type { CustomSection, WordTranslation } from '@/types';
import { normalizeWordTranslationPayload } from '../../../shared/word-translations';

type WordTranslationInput = {
  id?: string;
  japanese?: string;
  rawJapanese?: string;
  japaneseSource?: 'scan' | 'ai';
  translations?: unknown;
  lexiconSenseId?: string;
  customSections?: unknown;
};

export type WordTranslationInsertRow = {
  word_id: string;
  lexicon_sense_id: string | null;
  translation_ja: string;
  normalized_translation_ja: string;
  source: 'scan' | 'ai' | 'user' | null;
  meaning_rank: number;
  position: number;
  is_primary: boolean;
};

type MaybePostgrestSchemaError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export function normalizeWordForTranslationPersistence<T extends WordTranslationInput>(
  word: T,
): Omit<T, 'japanese' | 'japaneseSource' | 'translations' | 'lexiconSenseId' | 'customSections'> & {
  japanese: string;
  japaneseSource?: 'scan' | 'ai';
  translations?: WordTranslation[];
  lexiconSenseId?: string;
  customSections?: CustomSection[];
} {
  const payload = normalizeWordTranslationPayload({
    translations: word.translations,
    japanese: word.japanese,
    rawJapanese: word.rawJapanese,
    japaneseSource: word.japaneseSource,
    lexiconSenseId: word.lexiconSenseId,
    customSections: word.customSections,
  });
  const primaryTranslation = payload.translations[0];
  const {
    japanese: _rawJapanese,
    japaneseSource: _rawJapaneseSource,
    translations: _rawTranslations,
    lexiconSenseId: _rawLexiconSenseId,
    customSections: _rawCustomSections,
    ...rest
  } = word;
  void _rawJapanese;
  void _rawJapaneseSource;
  void _rawTranslations;
  void _rawLexiconSenseId;
  void _rawCustomSections;

  return {
    ...rest,
    japanese: payload.japanese || word.japanese || '',
    ...(payload.translations.length > 0 ? { translations: payload.translations } : {}),
    ...(payload.customSections ? { customSections: payload.customSections } : {}),
    ...(payload.japaneseSource ? { japaneseSource: payload.japaneseSource } : {}),
    ...(primaryTranslation?.lexiconSenseId || word.lexiconSenseId
      ? { lexiconSenseId: primaryTranslation?.lexiconSenseId ?? word.lexiconSenseId }
      : {}),
  };
}

function getTranslationJapaneseSource(
  translation: WordTranslation,
  fallback?: 'scan' | 'ai',
): 'scan' | 'ai' | undefined {
  return translation.source === 'scan' || translation.source === 'ai'
    ? translation.source
    : fallback;
}

export function expandWordsByTranslationsForPersistence<T extends WordTranslationInput>(
  words: readonly T[],
): Array<ReturnType<typeof normalizeWordForTranslationPersistence<T>>> {
  const expanded: Array<ReturnType<typeof normalizeWordForTranslationPersistence<T>>> = [];

  for (const word of words) {
    const normalizedWord = normalizeWordForTranslationPersistence(word);
    const translations = normalizedWord.translations ?? [];

    if (word.id || translations.length <= 1) {
      expanded.push(normalizedWord);
      continue;
    }

    const seen = new Set<string>();
    for (const translation of translations) {
      const normalizedTranslation = (translation.normalizedTranslationJa || translation.translationJa).trim().toLowerCase();
      if (!normalizedTranslation || seen.has(normalizedTranslation)) continue;
      seen.add(normalizedTranslation);

      expanded.push({
        ...normalizedWord,
        japanese: translation.translationJa,
        japaneseSource: getTranslationJapaneseSource(translation, normalizedWord.japaneseSource),
        lexiconSenseId: translation.lexiconSenseId ?? (translation.isPrimary ? normalizedWord.lexiconSenseId : undefined),
        translations: [{
          ...translation,
          meaningRank: 1,
          position: 0,
          isPrimary: true,
        }],
      });
    }
  }

  return expanded;
}

export function buildWordTranslationInsertRows(
  words: readonly WordTranslationInput[],
  insertedWordIds: readonly string[],
): WordTranslationInsertRow[] {
  const rows: WordTranslationInsertRow[] = [];

  words.forEach((word, wordIndex) => {
    const wordId = insertedWordIds[wordIndex];
    if (!wordId) return;

    const normalizedWord = normalizeWordForTranslationPersistence(word);
    (normalizedWord.translations ?? []).forEach((translation, index) => {
      rows.push({
        word_id: wordId,
        lexicon_sense_id: translation.lexiconSenseId ?? null,
        translation_ja: translation.translationJa,
        normalized_translation_ja: translation.normalizedTranslationJa || translation.translationJa,
        source: translation.source ?? normalizedWord.japaneseSource ?? null,
        meaning_rank: translation.meaningRank > 0 ? translation.meaningRank : index + 1,
        position: index,
        is_primary: index === 0,
      });
    });
  });

  return rows;
}

export function isWordTranslationsSchemaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as MaybePostgrestSchemaError;
  const text = `${candidate.code ?? ''} ${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
  return (
    candidate.code === '42P01'
    || candidate.code === '42703'
    || candidate.code === 'PGRST200'
    || candidate.code === 'PGRST204'
  ) && (
    text.includes('word_translations')
    || text.includes('lexicon_sense_id')
    || text.includes('schema cache')
    || text.includes('could not find')
    || text.includes('does not exist')
  );
}
