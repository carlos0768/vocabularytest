import type { WordTranslation, WordTranslationSource } from '@/types';

/**
 * Compact per-word meaning list stored on shared_wordbook_words.translations
 * (JSONB) and served by the book-import APIs. Keys are restricted to the ones
 * the /api/words/create translation schema accepts, so clients can forward
 * entries unchanged when copying a wordbook.
 */
export type SnapshotTranslation = {
  translationJa: string;
  meaningRank?: number;
  source?: WordTranslationSource;
};

function normalizeSource(value: unknown): WordTranslationSource | undefined {
  return value === 'scan' || value === 'ai' || value === 'user' ? value : undefined;
}

function normalizeRank(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : undefined;
}

/** Parse the JSONB column (or an API payload) into SnapshotTranslation[]. */
export function normalizeSnapshotTranslations(value: unknown): SnapshotTranslation[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const result: SnapshotTranslation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const translationJa = typeof record.translationJa === 'string' ? record.translationJa.trim() : '';
    if (!translationJa) continue;
    const meaningRank = normalizeRank(record.meaningRank);
    const source = normalizeSource(record.source);
    result.push({
      translationJa,
      ...(meaningRank ? { meaningRank } : {}),
      ...(source ? { source } : {}),
    });
  }
  return result.length > 0 ? result : undefined;
}

/**
 * Convert embedded word_translations rows (snake_case, as returned by a
 * PostgREST `word_translations(...)` relation select) into snapshot entries,
 * primary meaning first.
 */
export function snapshotTranslationsFromWordTranslationRows(value: unknown): SnapshotTranslation[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const rows = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((record) => ({
      translationJa: typeof record.translation_ja === 'string' ? record.translation_ja.trim() : '',
      meaningRank: normalizeRank(record.meaning_rank),
      position: typeof record.position === 'number' ? record.position : 0,
      isPrimary: record.is_primary === true,
      source: normalizeSource(record.source),
    }))
    .filter((row) => row.translationJa);
  if (rows.length === 0) return undefined;

  rows.sort((a, b) => (
    Number(b.isPrimary) - Number(a.isPrimary)
    || (a.meaningRank ?? Number.MAX_SAFE_INTEGER) - (b.meaningRank ?? Number.MAX_SAFE_INTEGER)
    || a.position - b.position
  ));

  return rows.map((row) => ({
    translationJa: row.translationJa,
    ...(row.meaningRank ? { meaningRank: row.meaningRank } : {}),
    ...(row.source ? { source: row.source } : {}),
  }));
}

/** Rehydrate snapshot entries into domain WordTranslation objects. */
export function snapshotTranslationsToWordTranslations(
  entries: readonly SnapshotTranslation[] | undefined,
): WordTranslation[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry, index) => ({
    translationJa: entry.translationJa,
    normalizedTranslationJa: entry.translationJa,
    ...(entry.source ? { source: entry.source } : {}),
    meaningRank: entry.meaningRank ?? index + 1,
    position: index,
    isPrimary: index === 0,
  }));
}
