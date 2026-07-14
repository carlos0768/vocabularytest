import type { Word, WordTranslation } from '@/types';
import { splitJapaneseTranslations } from '../../../shared/word-translations';

export type DisplayTranslation = {
  label: string;
  text: string;
  meaningRank: number;
  isPrimary: boolean;
  opacity: number;
};

function normalizeRank(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function opacityForRank(rank: number): number {
  if (rank <= 1) return 1;
  if (rank === 2) return 0.72;
  if (rank === 3) return 0.56;
  return 0.44;
}

export function getDisplayTranslations(word: Pick<Word, 'japanese' | 'translations'>): DisplayTranslation[] {
  const sourceTranslations: WordTranslation[] = Array.isArray(word.translations)
    ? word.translations.filter((translation) => translation.translationJa.trim().length > 0)
    : [];

  const translations = sourceTranslations.length > 0
    ? sourceTranslations
    : word.japanese.trim().length > 0
      ? [{
        translationJa: word.japanese.trim(),
        normalizedTranslationJa: word.japanese.trim(),
        meaningRank: 1,
        position: 0,
        isPrimary: true,
      }]
      : [];

  // Legacy rows can hold several meanings merged into one string
  // ("1.走る2.経営する"); split them here so every meaning renders as its
  // own item even when the stored data was never migrated.
  const expanded: Array<{ text: string; meaningRank?: unknown; isPrimary: boolean }> = translations
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((translation) => {
      const parts = splitJapaneseTranslations(translation.translationJa);
      return parts.length > 1
        ? parts.map((part) => ({ text: part, isPrimary: translation.isPrimary }))
        : [{ text: translation.translationJa, meaningRank: translation.meaningRank, isPrimary: translation.isPrimary }];
    });

  return expanded
    .map((translation, index) => {
      const rank = normalizeRank(translation.meaningRank, index + 1);
      return {
        label: `${index + 1}.`,
        text: translation.text,
        meaningRank: rank,
        isPrimary: index === 0 || translation.isPrimary,
        opacity: opacityForRank(rank),
      };
    });
}

export function formatJapaneseForDisplay(word: Pick<Word, 'japanese' | 'translations'>): string {
  const translations = getDisplayTranslations(word);
  if (translations.length === 0) return '';
  if (translations.length === 1) return translations[0].text;
  return translations.map((translation) => `${translation.label}${translation.text}`).join(' ');
}
