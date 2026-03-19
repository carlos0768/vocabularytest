import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { LexiconEntry } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  buildPosClassificationKey,
  classifyPartOfSpeechBatchWithAI,
} from './ai';
import {
  lookupLexiconEntriesByKeys,
  type LexiconLookupKey,
} from './master-first-scan';
import type { PendingLexiconEnrichmentCandidate } from './types';
import {
  normalizeHeadword,
  normalizeLexiconTranslation,
  resolvePrimaryLexiconPos,
  type LexiconPos,
  type LexiconTranslationSource,
} from '../../../shared/lexicon';

const MAX_WORD_IDS_PER_JOB = 200;

const wordIdSchema = z.string().uuid();

export const wordLexiconResolutionPayloadSchema = z.object({
  wordIds: z.array(wordIdSchema).min(1).max(MAX_WORD_IDS_PER_JOB),
  aiTranslatedWordIds: z.array(wordIdSchema).max(MAX_WORD_IDS_PER_JOB).optional().default([]),
}).strict();

export type WordLexiconResolutionJobSource = 'scan' | 'manual';

export interface WordLexiconResolutionStats {
  wordCount: number;
  resolvedCount: number;
  tagBackfilledCount: number;
  skippedCount: number;
  pendingEnrichmentCandidates: PendingLexiconEnrichmentCandidate[];
  elapsedMs: number;
  runtimeCreatedCount: number;
}

interface WordResolutionRow {
  id: string;
  english: string;
  japanese: string;
  lexicon_entry_id: string | null;
  part_of_speech_tags: unknown | null;
}

interface LexiconPosRow {
  id: string;
  pos: string;
  translation_ja?: string | null;
}

interface RuntimeLexiconEntryUpsert {
  headword: string;
  normalized_headword: string;
  pos: LexiconPos;
  cefr_level: null;
  dataset_sources: string[];
  translation_ja: string | null;
  translation_source: LexiconTranslationSource | null;
}

interface MasterTranslationUpdate {
  id: string;
  translationJa: string;
}

interface PreparedUnresolvedRow extends WordResolutionRow {
  normalizedHeadword: string;
  pos: LexiconPos;
  key: string | null;
  resolvedPartOfSpeechTags: string[];
  hadMissingTags: boolean;
}

export interface WordLexiconResolutionDeps {
  supabaseAdmin?: SupabaseClient;
  aiTranslatedWordIds?: string[];
  lookupEntries?: (keys: LexiconLookupKey[]) => Promise<LexiconEntry[]>;
  classifyPartOfSpeechBatch?: (
    inputs: Array<{ english: string; japaneseHint?: string | null }>
  ) => Promise<Map<string, LexiconPos>>;
  upsertRuntimeEntries?: (entries: RuntimeLexiconEntryUpsert[]) => Promise<void>;
  updateMasterTranslations?: (updates: MasterTranslationUpdate[]) => Promise<void>;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeUsableJapanese(value: string | null | undefined): string {
  const normalized = normalizeLexiconTranslation(value) ?? '';
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(normalized) ? normalized : '';
}

function getDeps(deps?: WordLexiconResolutionDeps) {
  const supabaseAdmin = deps?.supabaseAdmin ?? getSupabaseAdmin();
  return {
    supabaseAdmin,
    lookupEntries: deps?.lookupEntries ?? ((keys: LexiconLookupKey[]) => lookupLexiconEntriesByKeys(keys, { supabaseAdmin })),
    classifyPartOfSpeechBatch: deps?.classifyPartOfSpeechBatch ?? classifyPartOfSpeechBatchWithAI,
    upsertRuntimeEntries: deps?.upsertRuntimeEntries ?? (async (entries: RuntimeLexiconEntryUpsert[]) => {
      if (entries.length === 0) return;
      const { error } = await supabaseAdmin
        .from('lexicon_entries')
        .upsert(entries, {
          onConflict: 'normalized_headword,pos',
          ignoreDuplicates: true,
        });

      if (error) {
        throw new Error(`Failed to upsert runtime lexicon entries: ${error.message}`);
      }
    }),
    updateMasterTranslations: deps?.updateMasterTranslations ?? (async (updates: MasterTranslationUpdate[]) => {
      if (updates.length === 0) return;
      const { error } = await supabaseAdmin.rpc('batch_update_lexicon_translations', {
        updates: JSON.stringify(updates.map((u) => ({
          id: u.id,
          translation_ja: u.translationJa,
        }))),
      });

      if (error) {
        throw new Error(`Failed to batch update lexicon translations: ${error.message}`);
      }
    }),
  };
}

function normalizeWordIds(wordIds: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const wordId of wordIds) {
    const candidate = wordId.trim();
    const parsed = wordIdSchema.safeParse(candidate);
    if (!parsed.success || seen.has(parsed.data)) {
      continue;
    }
    seen.add(parsed.data);
    normalized.push(parsed.data);
  }

  return normalized;
}

export function needsWordLexiconResolution(word: {
  lexiconEntryId?: string | null;
  partOfSpeechTags?: unknown;
}): boolean {
  return !word.lexiconEntryId || normalizePartOfSpeechTags(word.partOfSpeechTags).length === 0;
}

export async function enqueueWordLexiconResolutionJobs(
  source: WordLexiconResolutionJobSource,
  wordIds: string[],
  deps?: Pick<WordLexiconResolutionDeps, 'supabaseAdmin' | 'aiTranslatedWordIds'>,
): Promise<string[]> {
  const normalizedWordIds = normalizeWordIds(wordIds);
  if (normalizedWordIds.length === 0) {
    return [];
  }

  const supabaseAdmin = deps?.supabaseAdmin ?? getSupabaseAdmin();
  const aiTranslatedWordIdSet = new Set(
    normalizeWordIds(deps?.aiTranslatedWordIds ?? [])
      .filter((wordId) => normalizedWordIds.includes(wordId)),
  );
  const rows = chunkArray(normalizedWordIds, MAX_WORD_IDS_PER_JOB).map((chunk) => ({
    status: 'pending',
    source,
    word_count: chunk.length,
    payload: {
      wordIds: chunk,
      aiTranslatedWordIds: chunk.filter((wordId) => aiTranslatedWordIdSet.has(wordId)),
    },
    error_message: null,
    attempt_count: 0,
    processing_started_at: null,
    completed_at: null,
  }));

  const { data, error } = await supabaseAdmin
    .from('word_lexicon_resolution_jobs')
    .insert(rows)
    .select('id');

  if (error) {
    throw new Error(error.message || 'Failed to enqueue word lexicon resolution jobs');
  }

  return (data ?? []).map((row) => String((row as { id: string }).id));
}

export async function triggerWordLexiconResolutionProcessing(
  requestUrl: string,
  jobId?: string,
): Promise<void> {
  const workerToken = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!workerToken) {
    console.error('[word-lexicon-resolution] Missing SUPABASE_SERVICE_ROLE_KEY while scheduling worker');
    return;
  }

  const processUrl = new URL('/api/word-lexicon-resolution/process', requestUrl);
  const response = await fetch(processUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${workerToken}`,
    },
    body: JSON.stringify(jobId ? { jobId } : {}),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[word-lexicon-resolution] Failed to trigger worker', {
      jobId,
      status: response.status,
      body,
    });
  }
}

async function loadWordRows(
  supabaseAdmin: SupabaseClient,
  wordIds: string[],
): Promise<WordResolutionRow[]> {
  if (wordIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('words')
    .select('id, english, japanese, lexicon_entry_id, part_of_speech_tags')
    .in('id', wordIds);

  if (error) {
    throw new Error(`Failed to load words for lexicon resolution: ${error.message}`);
  }

  return (data ?? []) as WordResolutionRow[];
}

async function loadLexiconPosMap(
  supabaseAdmin: SupabaseClient,
  lexiconEntryIds: string[],
): Promise<Map<string, string>> {
  if (lexiconEntryIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('lexicon_entries')
    .select('id, pos')
    .in('id', lexiconEntryIds);

  if (error) {
    throw new Error(`Failed to load lexicon entries for word resolution: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as LexiconPosRow[]).map((row) => [row.id, row.pos]),
  );
}

async function loadLexiconRowsByIds(
  supabaseAdmin: SupabaseClient,
  lexiconEntryIds: string[],
): Promise<Map<string, LexiconPosRow>> {
  if (lexiconEntryIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from('lexicon_entries')
    .select('id, pos, translation_ja')
    .in('id', lexiconEntryIds);

  if (error) {
    throw new Error(`Failed to load lexicon entries for translation backfill: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as LexiconPosRow[]).map((row) => [row.id, row]),
  );
}

interface WordRowUpdate {
  id: string;
  lexicon_entry_id?: string;
  part_of_speech_tags?: string[];
}

async function batchUpdateWordRows(
  supabaseAdmin: SupabaseClient,
  updates: WordRowUpdate[],
): Promise<void> {
  if (updates.length === 0) return;

  const { error } = await supabaseAdmin.rpc('batch_update_word_lexicon_links', {
    updates: JSON.stringify(updates),
  });

  if (error) {
    throw new Error(`Failed to batch update word lexicon links: ${error.message}`);
  }
}

function prepareUnresolvedRows(
  rows: WordResolutionRow[],
  classifications: Map<string, LexiconPos>,
): PreparedUnresolvedRow[] {
  return rows.map((row) => {
    const existingTags = normalizePartOfSpeechTags(row.part_of_speech_tags);
    const hadMissingTags = existingTags.length === 0;
    const inferredPos = hadMissingTags
      ? (classifications.get(buildPosClassificationKey(row.english, row.japanese)) ?? 'other')
      : resolvePrimaryLexiconPos(existingTags);
    const resolvedPartOfSpeechTags = hadMissingTags ? [inferredPos] : existingTags;
    const normalizedHeadword = normalizeHeadword(row.english);

    return {
      ...row,
      normalizedHeadword,
      pos: inferredPos,
      key: normalizedHeadword ? `${normalizedHeadword}::${inferredPos}` : null,
      resolvedPartOfSpeechTags,
      hadMissingTags,
    };
  });
}

function mapLexiconEntriesByKey(entries: LexiconEntry[]): Map<string, LexiconEntry> {
  return new Map(
    entries.map((entry) => [
      `${entry.normalizedHeadword}::${entry.pos}`,
      entry,
    ] as const),
  );
}

export async function processWordLexiconResolutionWords(
  wordIds: string[],
  deps?: WordLexiconResolutionDeps,
): Promise<WordLexiconResolutionStats> {
  const startedAt = Date.now();
  const normalizedWordIds = normalizeWordIds(wordIds);
  const {
    supabaseAdmin,
    lookupEntries,
    classifyPartOfSpeechBatch,
    upsertRuntimeEntries,
    updateMasterTranslations,
  } = getDeps(deps);
  const aiTranslatedWordIdSet = new Set(normalizeWordIds(deps?.aiTranslatedWordIds ?? []));

  if (normalizedWordIds.length === 0) {
    return {
      wordCount: 0,
      resolvedCount: 0,
      tagBackfilledCount: 0,
      skippedCount: 0,
      pendingEnrichmentCandidates: [],
      elapsedMs: Date.now() - startedAt,
      runtimeCreatedCount: 0,
    };
  }

  const rows = await loadWordRows(supabaseAdmin, normalizedWordIds);
  const alreadyResolvedCount = rows.filter((row) => !needsWordLexiconResolution({
    lexiconEntryId: row.lexicon_entry_id,
    partOfSpeechTags: row.part_of_speech_tags,
  })).length;

  let resolvedCount = 0;
  let tagBackfilledCount = 0;
  let skippedCount = normalizedWordIds.length - rows.length + alreadyResolvedCount;

  const rowsNeedingTagsFromLexicon = rows.filter((row) =>
    Boolean(row.lexicon_entry_id) && normalizePartOfSpeechTags(row.part_of_speech_tags).length === 0,
  );

  const lexiconPosMap = await loadLexiconPosMap(
    supabaseAdmin,
    rowsNeedingTagsFromLexicon
      .map((row) => row.lexicon_entry_id)
      .filter((value): value is string => Boolean(value)),
  );

  const tagBackfillUpdates: WordRowUpdate[] = [];
  for (const row of rowsNeedingTagsFromLexicon) {
    const normalizedTags = normalizePartOfSpeechTags([
      lexiconPosMap.get(row.lexicon_entry_id ?? '') ?? '',
    ]);
    if (normalizedTags.length === 0) {
      skippedCount += 1;
      continue;
    }

    tagBackfillUpdates.push({ id: row.id, part_of_speech_tags: normalizedTags });
    tagBackfilledCount += 1;
  }
  await batchUpdateWordRows(supabaseAdmin, tagBackfillUpdates);

  const linkedAiRows = rows.filter((row) => Boolean(row.lexicon_entry_id) && aiTranslatedWordIdSet.has(row.id));
  const linkedLexiconRows = await loadLexiconRowsByIds(
    supabaseAdmin,
    linkedAiRows
      .map((row) => row.lexicon_entry_id)
      .filter((value): value is string => Boolean(value)),
  );

  const linkedMasterTranslationUpdates = Array.from(
    new Map(
      linkedAiRows.flatMap((row) => {
        const lexiconRow = linkedLexiconRows.get(row.lexicon_entry_id ?? '');
        if (!lexiconRow || normalizeUsableJapanese(lexiconRow.translation_ja)) {
          return [];
        }

        const translationJa = normalizeUsableJapanese(row.japanese);
        if (!translationJa) {
          return [];
        }

        return [[lexiconRow.id, {
          id: lexiconRow.id,
          translationJa,
        }] as const];
      }),
    ).values(),
  );

  if (linkedMasterTranslationUpdates.length > 0) {
    await updateMasterTranslations(linkedMasterTranslationUpdates);
  }

  const unresolvedRows = rows.filter((row) => !row.lexicon_entry_id);
  if (unresolvedRows.length === 0) {
    return {
      wordCount: normalizedWordIds.length,
      resolvedCount,
      tagBackfilledCount,
      skippedCount,
      pendingEnrichmentCandidates: [],
      elapsedMs: Date.now() - startedAt,
      runtimeCreatedCount: 0,
    };
  }

  const rowsMissingTags = unresolvedRows.filter((row) => normalizePartOfSpeechTags(row.part_of_speech_tags).length === 0);
  const classifications = rowsMissingTags.length > 0
    ? await classifyPartOfSpeechBatch(
      rowsMissingTags.map((row) => ({
        english: row.english,
        japaneseHint: row.japanese,
      })),
    )
    : new Map<string, LexiconPos>();

  const preparedRows = prepareUnresolvedRows(unresolvedRows, classifications);
  const lookupKeys = Array.from(
    new Map(
      preparedRows
        .filter((row) => row.key)
        .map((row) => [
          row.key as string,
          {
            normalizedHeadword: row.normalizedHeadword,
            pos: row.pos,
          },
        ] as const),
    ).values(),
  );

  const preferredEnglishByKey = new Map<string, string>();
  const aiTranslationsByKey = new Map<string, string>();
  for (const row of preparedRows) {
    if (row.key && !preferredEnglishByKey.has(row.key)) {
      preferredEnglishByKey.set(row.key, row.english.trim());
    }

    if (!row.key || !aiTranslatedWordIdSet.has(row.id)) {
      continue;
    }

    const normalizedJapanese = normalizeUsableJapanese(row.japanese);
    if (!normalizedJapanese || aiTranslationsByKey.has(row.key)) {
      continue;
    }
    aiTranslationsByKey.set(row.key, normalizedJapanese);
  }

  let lexiconEntries = await lookupEntries(lookupKeys);
  let entryByKey = mapLexiconEntriesByKey(lexiconEntries);

  const masterTranslationUpdates: MasterTranslationUpdate[] = [];
  for (const entry of lexiconEntries) {
    if (normalizeUsableJapanese(entry.translationJa)) {
      continue;
    }
    const key = `${entry.normalizedHeadword}::${entry.pos}`;
    const translationJa = aiTranslationsByKey.get(key);
    if (!translationJa) {
      continue;
    }
    masterTranslationUpdates.push({
      id: entry.id,
      translationJa,
    });
  }

  if (masterTranslationUpdates.length > 0) {
    await updateMasterTranslations(masterTranslationUpdates);
    lexiconEntries = lexiconEntries.map((entry) => {
      const update = masterTranslationUpdates.find((candidate) => candidate.id === entry.id);
      return update
        ? {
          ...entry,
          translationJa: update.translationJa,
          translationSource: 'ai',
        }
        : entry;
    });
    entryByKey = mapLexiconEntriesByKey(lexiconEntries);
  }

  const missingKeys = lookupKeys.filter((key) => !entryByKey.has(`${key.normalizedHeadword}::${key.pos}`));
  const runtimeEntries: RuntimeLexiconEntryUpsert[] = missingKeys.map((key) => {
    const entryKey = `${key.normalizedHeadword}::${key.pos}`;
    const translationJa = aiTranslationsByKey.get(entryKey) ?? null;
    return {
      headword: preferredEnglishByKey.get(entryKey) ?? key.normalizedHeadword,
      normalized_headword: key.normalizedHeadword,
      pos: key.pos,
      cefr_level: null,
      dataset_sources: ['runtime'],
      translation_ja: translationJa,
      translation_source: translationJa ? 'ai' : null,
    };
  });

  if (runtimeEntries.length > 0) {
    await upsertRuntimeEntries(runtimeEntries);
    lexiconEntries = await lookupEntries(lookupKeys);
    entryByKey = mapLexiconEntriesByKey(lexiconEntries);
  }

  const finalUpdates: WordRowUpdate[] = [];
  for (const row of preparedRows) {
    const update: WordRowUpdate = { id: row.id };
    const entry = row.key ? entryByKey.get(row.key) : undefined;
    let hasChanges = false;

    if (entry?.id) {
      update.lexicon_entry_id = entry.id;
      resolvedCount += 1;
      hasChanges = true;
    }

    if (row.hadMissingTags) {
      const normalizedTags = entry
        ? normalizePartOfSpeechTags([entry.pos])
        : row.resolvedPartOfSpeechTags;
      if (normalizedTags.length > 0) {
        update.part_of_speech_tags = normalizedTags;
        tagBackfilledCount += 1;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      skippedCount += 1;
      continue;
    }

    finalUpdates.push(update);
  }
  await batchUpdateWordRows(supabaseAdmin, finalUpdates);

  return {
    wordCount: normalizedWordIds.length,
    resolvedCount,
    tagBackfilledCount,
    skippedCount,
    pendingEnrichmentCandidates: [],
    elapsedMs: Date.now() - startedAt,
    runtimeCreatedCount: runtimeEntries.length,
  };
}
