import { normalizePartOfSpeechTags } from '@/lib/ai/part-of-speech';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { AIWordExtraction } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { LexiconTranslationSource } from '../../../shared/lexicon';

import {
  resolveWordsWithLexicon,
  type ResolvedLexiconWord,
} from './resolver';
import type { PendingLexiconEnrichmentCandidate } from './types';

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
}

export interface WordLexiconResolutionDeps {
  supabaseAdmin?: SupabaseClient;
  aiTranslatedWordIds?: string[];
  resolveWords?: (
    words: Array<Pick<AIWordExtraction, 'english' | 'japanese' | 'distractors' | 'partOfSpeechTags'> & {
      japaneseSource?: LexiconTranslationSource;
    }>
  ) => Promise<{
    words: ResolvedLexiconWord<Pick<AIWordExtraction, 'english' | 'japanese' | 'distractors' | 'partOfSpeechTags'> & {
      japaneseSource?: LexiconTranslationSource;
    }>[];
    lexiconEntries: unknown[];
    pendingEnrichmentCandidates: PendingLexiconEnrichmentCandidate[];
    metrics: {
      syncTranslationCount: number;
      queuedHintValidationCount: number;
      posInferredCount: number;
      olpReusedCount: number;
      runtimeCreatedCount: number;
      resolverElapsedMs: number;
    };
  }>;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getDeps(deps?: WordLexiconResolutionDeps) {
  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    resolveWords: deps?.resolveWords ?? resolveWordsWithLexicon,
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

async function updateWordRow(
  supabaseAdmin: SupabaseClient,
  wordId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('words')
    .update(updates)
    .eq('id', wordId);

  if (error) {
    throw new Error(`Failed to update resolved word ${wordId}: ${error.message}`);
  }
}

export async function processWordLexiconResolutionWords(
  wordIds: string[],
  deps?: WordLexiconResolutionDeps,
): Promise<WordLexiconResolutionStats> {
  const startedAt = Date.now();
  const normalizedWordIds = normalizeWordIds(wordIds);
  const { supabaseAdmin, resolveWords } = getDeps(deps);
  const aiTranslatedWordIdSet = new Set(normalizeWordIds(deps?.aiTranslatedWordIds ?? []));

  if (normalizedWordIds.length === 0) {
    return {
      wordCount: 0,
      resolvedCount: 0,
      tagBackfilledCount: 0,
      skippedCount: 0,
      pendingEnrichmentCandidates: [],
      elapsedMs: Date.now() - startedAt,
    };
  }

  const rows = await loadWordRows(supabaseAdmin, normalizedWordIds);
  const alreadyResolvedCount = rows.filter((row) => !needsWordLexiconResolution({
    lexiconEntryId: row.lexicon_entry_id,
    partOfSpeechTags: row.part_of_speech_tags,
  })).length;

  let resolvedCount = 0;
  let tagBackfilledCount = 0;
  const pendingEnrichmentCandidates: PendingLexiconEnrichmentCandidate[] = [];
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

  for (const row of rowsNeedingTagsFromLexicon) {
    const normalizedTags = normalizePartOfSpeechTags([
      lexiconPosMap.get(row.lexicon_entry_id ?? '') ?? '',
    ]);
    if (normalizedTags.length === 0) {
      skippedCount += 1;
      continue;
    }

    await updateWordRow(supabaseAdmin, row.id, {
      part_of_speech_tags: normalizedTags,
    });
    tagBackfilledCount += 1;
  }

  const unresolvedRows = rows.filter((row) => !row.lexicon_entry_id);
  if (unresolvedRows.length > 0) {
    const result = await resolveWords(
      unresolvedRows.map((row) => ({
        english: row.english,
        japanese: row.japanese,
        distractors: [],
        partOfSpeechTags: normalizePartOfSpeechTags(row.part_of_speech_tags),
        japaneseSource: aiTranslatedWordIdSet.has(row.id) ? 'ai' : undefined,
      })),
    );

    pendingEnrichmentCandidates.push(...result.pendingEnrichmentCandidates);

    for (const [index, row] of unresolvedRows.entries()) {
      const resolvedWord = result.words[index];
      if (!resolvedWord) {
        skippedCount += 1;
        continue;
      }

      const updates: Record<string, unknown> = {};
      if (resolvedWord.lexiconEntryId) {
        updates.lexicon_entry_id = resolvedWord.lexiconEntryId;
        resolvedCount += 1;
      }

      if (normalizePartOfSpeechTags(row.part_of_speech_tags).length === 0) {
        const normalizedTags = normalizePartOfSpeechTags(resolvedWord.partOfSpeechTags);
        if (normalizedTags.length > 0) {
          updates.part_of_speech_tags = normalizedTags;
          tagBackfilledCount += 1;
        }
      }

      if (Object.keys(updates).length === 0) {
        skippedCount += 1;
        continue;
      }

      await updateWordRow(supabaseAdmin, row.id, updates);
    }
  }

  return {
    wordCount: normalizedWordIds.length,
    resolvedCount,
    tagBackfilledCount,
    skippedCount,
    pendingEnrichmentCandidates,
    elapsedMs: Date.now() - startedAt,
  };
}
