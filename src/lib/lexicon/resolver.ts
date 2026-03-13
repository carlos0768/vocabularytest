import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { AIWordExtraction, LexiconEntry } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeHeadword,
  normalizeLexiconTranslation,
  resolvePrimaryLexiconPos,
  type LexiconPos,
  type LexiconTranslationSource,
} from '../../../shared/lexicon';
import {
  buildLexiconKey,
  buildPosClassificationKey,
  classifyPartOfSpeechBatchWithAI,
  translateWithAI,
  translateWordsWithAI,
  validateTranslationCandidatesWithAI,
} from './ai';
import type {
  LexiconResolveMetrics,
  PendingLexiconEnrichmentCandidate,
  ValidatedTranslationCandidate,
} from './types';

export type {
  LexiconResolveMetrics,
  PendingLexiconEnrichmentCandidate,
  ValidatedTranslationCandidate,
} from './types';

export interface LexiconResolverInput {
  english: string;
  japaneseHint?: string | null;
  partOfSpeechTags?: string[];
}

export type ResolvedLexiconWord<T extends AIWordExtraction = AIWordExtraction> = Omit<
  T,
  'english' | 'japanese' | 'lexiconEntryId' | 'cefrLevel'
> & {
  english: string;
  japanese: string;
  lexiconEntryId?: string;
  cefrLevel?: string;
};

interface LexiconEntryRow {
  id: string;
  headword: string;
  normalized_headword: string;
  pos: string;
  cefr_level: string | null;
  dataset_sources: string[] | null;
  translation_ja: string | null;
  translation_source: string | null;
  created_at: string;
  updated_at: string;
}

interface ResolveLexiconEntryResult {
  entry: LexiconEntry | null;
  pendingEnrichmentCandidate?: PendingLexiconEnrichmentCandidate;
  translatedSynchronously: boolean;
  reusedOlpEntry: boolean;
  createdRuntimeEntry: boolean;
}

export interface ResolveLexiconDeps {
  supabaseAdmin?: SupabaseClient;
  translateWord?: (english: string, pos: LexiconPos) => Promise<string | null>;
  translateWords?: (
    inputs: Array<{ english: string; pos: LexiconPos }>
  ) => Promise<Map<string, string | null>>;
  validateTranslationCandidates?: (
    inputs: Array<{ english: string; pos: LexiconPos; japaneseHint: string }>
  ) => Promise<Map<string, ValidatedTranslationCandidate | null>>;
  classifyPartOfSpeechBatch?: (
    inputs: Array<{ english: string; japaneseHint?: string | null }>
  ) => Promise<Map<string, LexiconPos>>;
}

function mapLexiconEntry(row: LexiconEntryRow): LexiconEntry {
  return {
    id: row.id,
    headword: row.headword,
    normalizedHeadword: row.normalized_headword,
    pos: row.pos,
    cefrLevel: row.cefr_level ?? undefined,
    datasetSources: row.dataset_sources ?? [],
    translationJa: normalizeLexiconTranslation(row.translation_ja) ?? undefined,
    translationSource: row.translation_source ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hasResolvedTranslation(row: LexiconEntryRow): boolean {
  return Boolean(normalizeLexiconTranslation(row.translation_ja));
}

function isOlpBackedRow(row: Pick<LexiconEntryRow, 'dataset_sources'>): boolean {
  return (row.dataset_sources ?? []).some((source) => source.startsWith('olp:'));
}

function hasPartOfSpeechTags(tags?: string[] | null): boolean {
  return Array.isArray(tags) && tags.length > 0;
}

async function inferMissingPartOfSpeechTags<T extends LexiconResolverInput>(
  inputs: T[],
  deps: ResolveLexiconDeps,
): Promise<{ inputs: T[]; inferredCount: number }> {
  const missingInputs = inputs.filter((input) => !hasPartOfSpeechTags(input.partOfSpeechTags));
  if (missingInputs.length === 0) {
    return { inputs, inferredCount: 0 };
  }

  const classifications = await (deps.classifyPartOfSpeechBatch ?? classifyPartOfSpeechBatchWithAI)(
    missingInputs.map((input) => ({
      english: input.english,
      japaneseHint: input.japaneseHint,
    })),
  );

  let inferredCount = 0;
  const normalizedInputs = inputs.map((input) => {
    if (hasPartOfSpeechTags(input.partOfSpeechTags)) {
      return {
        ...input,
        japaneseHint: normalizeLexiconTranslation(input.japaneseHint) ?? undefined,
      };
    }

    inferredCount += 1;
    const inferredPos = classifications.get(buildPosClassificationKey(input.english, input.japaneseHint)) ?? 'other';
    return {
      ...input,
      japaneseHint: normalizeLexiconTranslation(input.japaneseHint) ?? undefined,
      partOfSpeechTags: [inferredPos],
    };
  });

  return {
    inputs: normalizedInputs,
    inferredCount,
  };
}

function createPendingEnrichmentCandidate(
  lexiconEntryId: string,
  english: string,
  pos: LexiconPos,
  japaneseHint: string | null,
): PendingLexiconEnrichmentCandidate | undefined {
  const normalizedHint = normalizeLexiconTranslation(japaneseHint);
  if (!normalizedHint) {
    return undefined;
  }

  return {
    lexiconEntryId,
    english,
    pos,
    japaneseHint: normalizedHint,
  };
}

async function loadLexiconEntryRow(
  supabaseAdmin: SupabaseClient,
  normalizedHeadword: string,
  pos: LexiconPos,
): Promise<LexiconEntryRow | null> {
  const { data, error } = await supabaseAdmin
    .from('lexicon_entries')
    .select('*')
    .eq('normalized_headword', normalizedHeadword)
    .eq('pos', pos)
    .maybeSingle<LexiconEntryRow>();

  if (error) {
    throw new Error(`Failed to load lexicon entry: ${error.message}`);
  }

  return data ?? null;
}

async function updateTranslationIfMissing(
  row: LexiconEntryRow,
  japaneseHint: string | null,
  deps?: ResolveLexiconDeps,
): Promise<ResolveLexiconEntryResult> {
  if (hasResolvedTranslation(row)) {
    return {
      entry: mapLexiconEntry(row),
      translatedSynchronously: false,
      reusedOlpEntry: isOlpBackedRow(row),
      createdRuntimeEntry: false,
    };
  }

  const pos = row.pos as LexiconPos;
  const pendingCandidate = createPendingEnrichmentCandidate(row.id, row.headword, pos, japaneseHint);
  if (pendingCandidate) {
    return {
      entry: mapLexiconEntry(row),
      pendingEnrichmentCandidate: pendingCandidate,
      translatedSynchronously: false,
      reusedOlpEntry: isOlpBackedRow(row),
      createdRuntimeEntry: false,
    };
  }

  const { supabaseAdmin, translateWord } = getResolverDeps(deps);
  const translation = await translateWord(row.headword, pos);
  if (!translation) {
    return {
      entry: mapLexiconEntry(row),
      translatedSynchronously: false,
      reusedOlpEntry: isOlpBackedRow(row),
      createdRuntimeEntry: false,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('lexicon_entries')
    .update({
      translation_ja: translation,
      translation_source: 'ai' as LexiconTranslationSource,
    })
    .eq('id', row.id)
    .select('*')
    .single<LexiconEntryRow>();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update lexicon translation');
  }

  return {
    entry: mapLexiconEntry(data),
    translatedSynchronously: true,
    reusedOlpEntry: isOlpBackedRow(data),
    createdRuntimeEntry: false,
  };
}

function getResolverDeps(deps?: ResolveLexiconDeps) {
  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    translateWord: deps?.translateWord ?? translateWithAI,
    translateWords: deps?.translateWords ?? translateWordsWithAI,
    validateTranslationCandidates: deps?.validateTranslationCandidates ?? validateTranslationCandidatesWithAI,
    classifyPartOfSpeechBatch: deps?.classifyPartOfSpeechBatch ?? classifyPartOfSpeechBatchWithAI,
  };
}

async function resolveOrCreateLexiconEntryResult(
  input: LexiconResolverInput,
  deps?: ResolveLexiconDeps,
  existingRow?: LexiconEntryRow | null,
): Promise<ResolveLexiconEntryResult> {
  const resolverDeps = getResolverDeps(deps);
  const { supabaseAdmin, translateWord } = resolverDeps;
  const { inputs: [preparedInput] } = await inferMissingPartOfSpeechTags([input], resolverDeps);
  const headword = preparedInput?.english.trim() ?? input.english.trim();
  const normalizedHeadword = normalizeHeadword(headword);
  if (!normalizedHeadword) {
    return {
      entry: null,
      translatedSynchronously: false,
      reusedOlpEntry: false,
      createdRuntimeEntry: false,
    };
  }

  const pos = resolvePrimaryLexiconPos(preparedInput?.partOfSpeechTags);
  const japaneseHint = normalizeLexiconTranslation(preparedInput?.japaneseHint);
  const row = existingRow ?? await loadLexiconEntryRow(supabaseAdmin, normalizedHeadword, pos);

  if (row) {
    return updateTranslationIfMissing(row, japaneseHint, deps);
  }

  let translation: string | null = null;
  let translationSource: LexiconTranslationSource | null = null;

  if (!japaneseHint) {
    translation = await translateWord(headword, pos);
    translationSource = translation ? 'ai' : null;
  }

  const insertPayload = {
    headword,
    normalized_headword: normalizedHeadword,
    pos,
    cefr_level: null,
    dataset_sources: ['runtime'],
    translation_ja: translation,
    translation_source: translationSource,
  };

  const { data: insertedRow, error: insertError } = await supabaseAdmin
    .from('lexicon_entries')
    .insert(insertPayload)
    .select('*')
    .single<LexiconEntryRow>();

  if (!insertError && insertedRow) {
    return {
      entry: mapLexiconEntry(insertedRow),
      pendingEnrichmentCandidate: createPendingEnrichmentCandidate(insertedRow.id, headword, pos, japaneseHint),
      translatedSynchronously: Boolean(translation),
      reusedOlpEntry: false,
      createdRuntimeEntry: true,
    };
  }

  const conflictedRow = await loadLexiconEntryRow(supabaseAdmin, normalizedHeadword, pos);
  if (!conflictedRow) {
    throw new Error(insertError?.message || 'Failed to create lexicon entry');
  }

  return updateTranslationIfMissing(conflictedRow, japaneseHint, deps);
}

export async function resolveOrCreateLexiconEntry(
  input: LexiconResolverInput,
  deps?: ResolveLexiconDeps,
): Promise<LexiconEntry | null> {
  const result = await resolveOrCreateLexiconEntryResult(input, deps);
  return result.entry;
}

export async function resolveWordsWithLexicon<T extends AIWordExtraction>(
  words: T[],
  deps?: ResolveLexiconDeps,
): Promise<{
  words: ResolvedLexiconWord<T>[];
  lexiconEntries: LexiconEntry[];
  pendingEnrichmentCandidates: PendingLexiconEnrichmentCandidate[];
  metrics: LexiconResolveMetrics;
}> {
  const startedAt = Date.now();
  const resolverDeps = getResolverDeps(deps);
  const { inputs: inferredResolverInputs, inferredCount } = await inferMissingPartOfSpeechTags(
    words.map((word) => ({
      english: word.english,
      japaneseHint: word.japanese,
      partOfSpeechTags: word.partOfSpeechTags,
    })),
    resolverDeps,
  );
  const preparedWords = words.map((word, index) => ({
    ...word,
    partOfSpeechTags: inferredResolverInputs[index]?.partOfSpeechTags ?? word.partOfSpeechTags ?? [],
  }));
  const resolverInputs = new Map<string, LexiconResolverInput>();

  for (const word of preparedWords) {
    const normalizedHeadword = normalizeHeadword(word.english);
    if (!normalizedHeadword) continue;
    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const key = buildLexiconKey(word.english, pos);
    const japaneseHint = normalizeLexiconTranslation(word.japanese);
    const existing = resolverInputs.get(key);

    if (!existing) {
      resolverInputs.set(key, {
        english: word.english,
        japaneseHint,
        partOfSpeechTags: word.partOfSpeechTags,
      });
      continue;
    }

    if (!existing.japaneseHint && japaneseHint) {
      existing.japaneseHint = japaneseHint;
    }

    if ((!existing.partOfSpeechTags || existing.partOfSpeechTags.length === 0) && word.partOfSpeechTags?.length) {
      existing.partOfSpeechTags = word.partOfSpeechTags;
    }
  }

  const existingRows = new Map<string, LexiconEntryRow | null>();
  await Promise.all(
    Array.from(resolverInputs.entries()).map(async ([key, input]) => {
      const pos = resolvePrimaryLexiconPos(input.partOfSpeechTags);
      existingRows.set(
        key,
        await loadLexiconEntryRow(
          resolverDeps.supabaseAdmin,
          normalizeHeadword(input.english),
          pos,
        ),
      );
    }),
  );

  const batchTranslationInputs = Array.from(resolverInputs.entries())
    .map(([key, input]) => ({
      key,
      input,
      pos: resolvePrimaryLexiconPos(input.partOfSpeechTags),
      existingRow: existingRows.get(key) ?? null,
    }))
    .filter(({ input, existingRow }) => !normalizeLexiconTranslation(input.japaneseHint) && !(existingRow && hasResolvedTranslation(existingRow)))
    .map(({ input, pos }) => ({
      english: input.english,
      pos,
    }));
  const batchedTranslations = batchTranslationInputs.length > 0
    ? await resolverDeps.translateWords(batchTranslationInputs)
    : new Map<string, string | null>();
  const batchTranslationKeys = new Set(batchTranslationInputs.map((input) => buildLexiconKey(input.english, input.pos)));

  const effectiveDeps: ResolveLexiconDeps = {
    ...deps,
    supabaseAdmin: resolverDeps.supabaseAdmin,
    translateWords: resolverDeps.translateWords,
    validateTranslationCandidates: resolverDeps.validateTranslationCandidates,
    classifyPartOfSpeechBatch: resolverDeps.classifyPartOfSpeechBatch,
    translateWord: async (english, pos) => {
      const key = buildLexiconKey(english, pos);
      if (batchTranslationKeys.has(key)) {
        return batchedTranslations.get(key) ?? null;
      }
      return resolverDeps.translateWord(english, pos);
    },
  };

  const resolvedEntryMap = new Map<string, LexiconEntry>();
  const pendingCandidateMap = new Map<string, PendingLexiconEnrichmentCandidate>();
  let olpReusedCount = 0;
  let runtimeCreatedCount = 0;

  for (const [key, input] of resolverInputs.entries()) {
    const result = await resolveOrCreateLexiconEntryResult(
      input,
      effectiveDeps,
      existingRows.get(key) ?? null,
    );
    if (result.entry) {
      resolvedEntryMap.set(key, result.entry);
    }
    if (result.pendingEnrichmentCandidate) {
      pendingCandidateMap.set(result.pendingEnrichmentCandidate.lexiconEntryId, result.pendingEnrichmentCandidate);
    }
    if (result.reusedOlpEntry) {
      olpReusedCount += 1;
    }
    if (result.createdRuntimeEntry) {
      runtimeCreatedCount += 1;
    }
  }

  const resolvedWords = preparedWords.map((word) => {
    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const key = buildLexiconKey(word.english, pos);
    const entry = resolvedEntryMap.get(key);
    const mergedInput = resolverInputs.get(key);
    return {
      ...word,
      english: entry?.headword ?? word.english,
      japanese: entry?.translationJa ?? mergedInput?.japaneseHint ?? normalizeLexiconTranslation(word.japanese) ?? '',
      partOfSpeechTags: mergedInput?.partOfSpeechTags ?? word.partOfSpeechTags ?? [],
      lexiconEntryId: entry?.id,
      cefrLevel: entry?.cefrLevel,
    };
  });

  return {
    words: resolvedWords,
    lexiconEntries: Array.from(resolvedEntryMap.values()),
    pendingEnrichmentCandidates: Array.from(pendingCandidateMap.values()),
    metrics: {
      syncTranslationCount: batchTranslationInputs.length,
      queuedHintValidationCount: pendingCandidateMap.size,
      posInferredCount: inferredCount,
      olpReusedCount,
      runtimeCreatedCount,
      resolverElapsedMs: Date.now() - startedAt,
    },
  };
}
