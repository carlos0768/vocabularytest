import {
  normalizeLexiconDatasetSources,
  normalizeLexiconTranslation,
  type LexiconTranslationSource,
} from '../../../shared/lexicon';

export interface LexiconCleanupRow {
  id: string;
  headword: string;
  normalized_headword: string;
  pos: string;
  dataset_sources: string[] | null;
  translation_ja: string | null;
  translation_source: string | null;
}

export interface LexiconCleanupWordRef {
  id: string;
  lexicon_entry_id: string | null;
}

export interface LexiconTranslationUpdate {
  lexiconEntryId: string;
  translationJa: string | null;
  translationSource: LexiconTranslationSource | null;
}

export interface LexiconWordRelink {
  runtimeLexiconEntryId: string;
  targetLexiconEntryId: string;
  wordIds: string[];
}

export interface LexiconMigrationTarget {
  sourceLexiconEntryId: string;
  targetLexiconEntryId: string;
  translationJa: string;
  translationSource: LexiconTranslationSource;
}

export interface LexiconCleanupSummary {
  lexiconRowCount: number;
  runtimeOtherRowCount: number;
  translationUpdateCount: number;
  translationNullifiedCount: number;
  relinkedRuntimeRowCount: number;
  relinkedWordCount: number;
  migratedTranslationCount: number;
  orphanDeleteCount: number;
  ambiguousRuntimeRowCount: number;
}

export interface LexiconCleanupPlan {
  translationUpdates: LexiconTranslationUpdate[];
  wordRelinks: LexiconWordRelink[];
  translationMigrations: LexiconMigrationTarget[];
  orphanRuntimeEntryIds: string[];
  ambiguousRuntimeEntryIds: string[];
  summary: LexiconCleanupSummary;
}

function isOlpSource(source: string): boolean {
  return source.startsWith('olp:');
}

function isRuntimeOnlyRow(row: LexiconCleanupRow): boolean {
  const sources = normalizeLexiconDatasetSources(row.dataset_sources ?? []);
  return sources.length === 1 && sources[0] === 'runtime';
}

export function buildLexiconCleanupPlan(
  lexiconEntries: LexiconCleanupRow[],
  wordRefs: LexiconCleanupWordRef[],
): LexiconCleanupPlan {
  const translationUpdates: LexiconTranslationUpdate[] = [];
  const wordRelinks: LexiconWordRelink[] = [];
  const translationMigrations: LexiconMigrationTarget[] = [];
  const ambiguousRuntimeEntryIds: string[] = [];
  const orphanRuntimeEntryIds = new Set<string>();

  const wordsByLexiconEntryId = new Map<string, string[]>();
  for (const word of wordRefs) {
    if (!word.lexicon_entry_id) continue;
    const existing = wordsByLexiconEntryId.get(word.lexicon_entry_id);
    if (existing) {
      existing.push(word.id);
    } else {
      wordsByLexiconEntryId.set(word.lexicon_entry_id, [word.id]);
    }
  }

  const rowById = new Map<string, LexiconCleanupRow>();
  const olpRowsByHeadword = new Map<string, LexiconCleanupRow[]>();

  for (const row of lexiconEntries) {
    rowById.set(row.id, row);

    const sanitizedTranslation = normalizeLexiconTranslation(row.translation_ja);
    const originalTranslation = row.translation_ja?.trim() || null;
    if (sanitizedTranslation !== originalTranslation) {
      translationUpdates.push({
        lexiconEntryId: row.id,
        translationJa: sanitizedTranslation,
        translationSource: sanitizedTranslation ? ((row.translation_source as LexiconTranslationSource | null) ?? 'ai') : null,
      });
    }

    if ((row.dataset_sources ?? []).some(isOlpSource)) {
      const existing = olpRowsByHeadword.get(row.normalized_headword);
      if (existing) {
        existing.push(row);
      } else {
        olpRowsByHeadword.set(row.normalized_headword, [row]);
      }
    }
  }

  for (const row of lexiconEntries) {
    if (!(isRuntimeOnlyRow(row) && row.pos === 'other')) {
      continue;
    }

    const olpCandidates = olpRowsByHeadword.get(row.normalized_headword) ?? [];
    if (olpCandidates.length > 1) {
      ambiguousRuntimeEntryIds.push(row.id);
      continue;
    }
    if (olpCandidates.length === 0) {
      continue;
    }

    const target = olpCandidates[0]!;
    const wordIds = wordsByLexiconEntryId.get(row.id) ?? [];
    if (wordIds.length > 0) {
      wordRelinks.push({
        runtimeLexiconEntryId: row.id,
        targetLexiconEntryId: target.id,
        wordIds,
      });
      orphanRuntimeEntryIds.add(row.id);
    }

    const runtimeTranslation = normalizeLexiconTranslation(row.translation_ja);
    const targetTranslation = normalizeLexiconTranslation(target.translation_ja);
    if (!targetTranslation && runtimeTranslation) {
      translationMigrations.push({
        sourceLexiconEntryId: row.id,
        targetLexiconEntryId: target.id,
        translationJa: runtimeTranslation,
        translationSource: (row.translation_source as LexiconTranslationSource | null) ?? 'ai',
      });
    }
    if (wordIds.length === 0) {
      orphanRuntimeEntryIds.add(row.id);
    }
  }

  return {
    translationUpdates,
    wordRelinks,
    translationMigrations,
    orphanRuntimeEntryIds: Array.from(orphanRuntimeEntryIds),
    ambiguousRuntimeEntryIds,
    summary: {
      lexiconRowCount: lexiconEntries.length,
      runtimeOtherRowCount: lexiconEntries.filter((row) => isRuntimeOnlyRow(row) && row.pos === 'other').length,
      translationUpdateCount: translationUpdates.length,
      translationNullifiedCount: translationUpdates.filter((item) => !item.translationJa).length,
      relinkedRuntimeRowCount: wordRelinks.length,
      relinkedWordCount: wordRelinks.reduce((sum, item) => sum + item.wordIds.length, 0),
      migratedTranslationCount: translationMigrations.length,
      orphanDeleteCount: orphanRuntimeEntryIds.size,
      ambiguousRuntimeRowCount: ambiguousRuntimeEntryIds.length,
    },
  };
}
