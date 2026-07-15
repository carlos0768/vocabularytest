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
  primaryTranslation,
  translateWithAI,
  translateWordSensesWithAI,
  translateWordsSensesWithAI,
  translateWordsWithAI,
  validateTranslationCandidatesWithAI,
} from './ai';
import { upsertAiTranslationSenses } from './senses';
import type {
  LexiconResolveMetrics,
  PendingLexiconEnrichmentCandidate,
  TranslatedSense,
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
  japaneseHintSource?: LexiconTranslationSource | null;
}

type ResolverWordInput = AIWordExtraction & {
  japaneseSource?: LexiconTranslationSource;
};

export type ResolvedLexiconWord<T extends ResolverWordInput = ResolverWordInput> = Omit<
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
  /** 多義語対応の訳生成。未指定時は translateWord/translateWords をラップする。 */
  translateWordSenses?: (english: string, pos: LexiconPos) => Promise<TranslatedSense[]>;
  translateWordsSenses?: (
    inputs: Array<{ english: string; pos: LexiconPos }>
  ) => Promise<Map<string, TranslatedSense[]>>;
  validateTranslationCandidates?: (
    inputs: Array<{ english: string; pos: LexiconPos; japaneseHint: string }>
  ) => Promise<Map<string, ValidatedTranslationCandidate | null>>;
  classifyPartOfSpeechBatch?: (
    inputs: Array<{ english: string; japaneseHint?: string | null }>
  ) => Promise<Map<string, LexiconPos>>;
}

function wrapSingleTranslationAsSenses(japanese: string | null): TranslatedSense[] {
  const normalized = normalizeLexiconTranslation(japanese);
  return normalized ? [{ japanese: normalized, meaningSummary: null, isPrimary: true }] : [];
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
  japaneseHintSource: LexiconTranslationSource | null,
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

  if (japaneseHint && japaneseHintSource === 'ai') {
    const { supabaseAdmin } = getResolverDeps(deps);
    const { data, error } = await supabaseAdmin
      .from('lexicon_entries')
      .update({
        translation_ja: japaneseHint,
        translation_source: 'ai' as LexiconTranslationSource,
      })
      .eq('id', row.id)
      .select('*')
      .single<LexiconEntryRow>();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to persist AI hint translation');
    }

    return {
      entry: mapLexiconEntry(data),
      translatedSynchronously: true,
      reusedOlpEntry: isOlpBackedRow(data),
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

  const { supabaseAdmin, translateWordSenses } = getResolverDeps(deps);
  const senses = await translateWordSenses(row.headword, pos);
  const translation = primaryTranslation(senses);
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

  // 多義語の全senseを lexicon_senses へ保存（ベストエフォート）
  await persistAiSensesBestEffort(supabaseAdmin, data.id, senses);

  return {
    entry: mapLexiconEntry(data),
    translatedSynchronously: true,
    reusedOlpEntry: isOlpBackedRow(data),
    createdRuntimeEntry: false,
  };
}

function getResolverDeps(deps?: ResolveLexiconDeps) {
  // テスト等で translateWord / translateWords（単一訳）だけが注入された場合は
  // senses 版をそのラッパーとして構成し、既存の注入コードを壊さない。
  const translateWordSenses = deps?.translateWordSenses
    ?? (deps?.translateWord
      ? async (english: string, pos: LexiconPos) =>
          wrapSingleTranslationAsSenses(await deps.translateWord!(english, pos))
      : translateWordSensesWithAI);
  const translateWordsSenses = deps?.translateWordsSenses
    ?? (deps?.translateWords
      ? async (inputs: Array<{ english: string; pos: LexiconPos }>) => {
          const primaries = await deps.translateWords!(inputs);
          const map = new Map<string, TranslatedSense[]>();
          for (const [key, japanese] of primaries) {
            map.set(key, wrapSingleTranslationAsSenses(japanese));
          }
          return map;
        }
      : translateWordsSensesWithAI);

  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    translateWord: deps?.translateWord ?? translateWithAI,
    translateWords: deps?.translateWords ?? translateWordsWithAI,
    translateWordSenses,
    translateWordsSenses,
    validateTranslationCandidates: deps?.validateTranslationCandidates ?? validateTranslationCandidatesWithAI,
    classifyPartOfSpeechBatch: deps?.classifyPartOfSpeechBatch ?? classifyPartOfSpeechBatchWithAI,
  };
}

/** AI訳senseの保存（ベストエフォート）。失敗しても解決処理は落とさない。 */
async function persistAiSensesBestEffort(
  supabaseAdmin: SupabaseClient,
  lexiconEntryId: string,
  senses: TranslatedSense[],
): Promise<void> {
  if (senses.length === 0) return;
  try {
    await upsertAiTranslationSenses(supabaseAdmin, lexiconEntryId, senses);
  } catch (senseError) {
    console.warn('[lexicon-resolver] Sense persistence failed (non-critical):', senseError);
  }
}

async function resolveOrCreateLexiconEntryResult(
  input: LexiconResolverInput,
  deps?: ResolveLexiconDeps,
  existingRow?: LexiconEntryRow | null,
): Promise<ResolveLexiconEntryResult> {
  const resolverDeps = getResolverDeps(deps);
  const { supabaseAdmin, translateWordSenses } = resolverDeps;
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
  const japaneseHintSource = preparedInput?.japaneseHintSource ?? null;
  const row = existingRow ?? await loadLexiconEntryRow(supabaseAdmin, normalizedHeadword, pos);

  if (row) {
    return updateTranslationIfMissing(row, japaneseHint, japaneseHintSource, deps);
  }

  let translation: string | null = null;
  let translationSource: LexiconTranslationSource | null = null;
  let aiSenses: TranslatedSense[] = [];

  if (japaneseHint && japaneseHintSource === 'ai') {
    translation = japaneseHint;
    translationSource = 'ai';
  } else if (!japaneseHint) {
    aiSenses = await translateWordSenses(headword, pos);
    translation = primaryTranslation(aiSenses);
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
    // 多義語の全senseを lexicon_senses へ保存（ベストエフォート）
    await persistAiSensesBestEffort(supabaseAdmin, insertedRow.id, aiSenses);

    return {
      entry: mapLexiconEntry(insertedRow),
      pendingEnrichmentCandidate: translation
        ? undefined
        : createPendingEnrichmentCandidate(insertedRow.id, headword, pos, japaneseHint),
      translatedSynchronously: Boolean(translation),
      reusedOlpEntry: false,
      createdRuntimeEntry: true,
    };
  }

  const conflictedRow = await loadLexiconEntryRow(supabaseAdmin, normalizedHeadword, pos);
  if (!conflictedRow) {
    throw new Error(insertError?.message || 'Failed to create lexicon entry');
  }

  return updateTranslationIfMissing(conflictedRow, japaneseHint, japaneseHintSource, deps);
}

export async function resolveOrCreateLexiconEntry(
  input: LexiconResolverInput,
  deps?: ResolveLexiconDeps,
): Promise<LexiconEntry | null> {
  const result = await resolveOrCreateLexiconEntryResult(input, deps);
  return result.entry;
}

export async function resolveWordsWithLexicon<T extends ResolverWordInput>(
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
        japaneseHintSource: word.japaneseSource ?? null,
      });
      continue;
    }

    if (!existing.japaneseHint && japaneseHint) {
      existing.japaneseHint = japaneseHint;
      existing.japaneseHintSource = word.japaneseSource ?? null;
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
  const batchedSenses = batchTranslationInputs.length > 0
    ? await resolverDeps.translateWordsSenses(batchTranslationInputs)
    : new Map<string, TranslatedSense[]>();
  const batchTranslationKeys = new Set(batchTranslationInputs.map((input) => buildLexiconKey(input.english, input.pos)));

  const effectiveDeps: ResolveLexiconDeps = {
    ...deps,
    supabaseAdmin: resolverDeps.supabaseAdmin,
    translateWords: resolverDeps.translateWords,
    translateWordsSenses: resolverDeps.translateWordsSenses,
    validateTranslationCandidates: resolverDeps.validateTranslationCandidates,
    classifyPartOfSpeechBatch: resolverDeps.classifyPartOfSpeechBatch,
    translateWord: async (english, pos) => {
      const key = buildLexiconKey(english, pos);
      if (batchTranslationKeys.has(key)) {
        return primaryTranslation(batchedSenses.get(key) ?? []);
      }
      return resolverDeps.translateWord(english, pos);
    },
    translateWordSenses: async (english, pos) => {
      const key = buildLexiconKey(english, pos);
      if (batchTranslationKeys.has(key)) {
        return batchedSenses.get(key) ?? [];
      }
      return resolverDeps.translateWordSenses(english, pos);
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
