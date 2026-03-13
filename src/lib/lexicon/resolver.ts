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
    };
  }

  const pos = row.pos as LexiconPos;
  const pendingCandidate = createPendingEnrichmentCandidate(row.id, row.headword, pos, japaneseHint);
  if (pendingCandidate) {
    return {
      entry: mapLexiconEntry(row),
      pendingEnrichmentCandidate: pendingCandidate,
      translatedSynchronously: false,
    };
  }

  const { supabaseAdmin, translateWord } = getResolverDeps(deps);
  const translation = await translateWord(row.headword, pos);
  if (!translation) {
    return {
      entry: mapLexiconEntry(row),
      translatedSynchronously: false,
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
  };
}

function getResolverDeps(deps?: ResolveLexiconDeps) {
  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    translateWord: deps?.translateWord ?? translateWithAI,
    translateWords: deps?.translateWords ?? translateWordsWithAI,
    validateTranslationCandidates: deps?.validateTranslationCandidates ?? validateTranslationCandidatesWithAI,
  };
}

async function resolveOrCreateLexiconEntryResult(
  input: LexiconResolverInput,
  deps?: ResolveLexiconDeps,
  existingRow?: LexiconEntryRow | null,
): Promise<ResolveLexiconEntryResult> {
  const { supabaseAdmin, translateWord } = getResolverDeps(deps);
  const headword = input.english.trim();
  const normalizedHeadword = normalizeHeadword(headword);
  if (!normalizedHeadword) {
    return {
      entry: null,
      translatedSynchronously: false,
    };
  }

  const pos = resolvePrimaryLexiconPos(input.partOfSpeechTags);
  const japaneseHint = normalizeLexiconTranslation(input.japaneseHint);
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
  const resolverInputs = new Map<string, LexiconResolverInput>();

  for (const word of words) {
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

  const resolverDeps = getResolverDeps(deps);
  const existingRows = new Map<string, LexiconEntryRow | null>();

  for (const [key, input] of resolverInputs.entries()) {
    const pos = resolvePrimaryLexiconPos(input.partOfSpeechTags);
    existingRows.set(
      key,
      await loadLexiconEntryRow(
        resolverDeps.supabaseAdmin,
        normalizeHeadword(input.english),
        pos,
      ),
    );
  }

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
  }

  const resolvedWords = words.map((word) => {
    const normalizedHeadword = normalizeHeadword(word.english);
    const pos = resolvePrimaryLexiconPos(word.partOfSpeechTags);
    const key = buildLexiconKey(normalizedHeadword, pos);
    const entry = resolvedEntryMap.get(key);
    const mergedInput = resolverInputs.get(key);
    return {
      ...word,
      english: entry?.headword ?? word.english,
      japanese: entry?.translationJa ?? mergedInput?.japaneseHint ?? normalizeLexiconTranslation(word.japanese) ?? '',
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
      resolverElapsedMs: Date.now() - startedAt,
    },
  };
}
