import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createInternalWorkerUrl, getInternalWorkerAuthorization } from '@/lib/api/internal-worker';
import {
  LEXICON_POS_VALUES,
  normalizeLexiconTranslation,
  type LexiconPos,
  type LexiconTranslationSource,
} from '../../../shared/lexicon';
import {
  buildLexiconKey,
  buildValidationKey,
  translateWordsWithAI,
  validateTranslationCandidatesWithAI,
} from './ai';
import type {
  LexiconEnrichmentJobSource,
  PendingLexiconEnrichmentCandidate,
  ValidatedTranslationCandidate,
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const candidateSchema = z.object({
  lexiconEntryId: z.string().uuid(),
  english: z.string().trim().min(1).max(200),
  pos: z.enum(LEXICON_POS_VALUES),
  japaneseHint: z.string().trim().min(1).max(300),
}).strict();

export const lexiconEnrichmentPayloadSchema = z.object({
  candidates: z.array(candidateSchema).max(200),
}).strict();

interface LexiconEntryRow {
  id: string;
  headword: string;
  pos: string;
  translation_ja: string | null;
}

export interface LexiconEnrichmentDeps {
  supabaseAdmin?: SupabaseClient;
  validateTranslationCandidates?: (
    inputs: Array<{ english: string; pos: LexiconPos; japaneseHint: string }>
  ) => Promise<Map<string, ValidatedTranslationCandidate | null>>;
  translateWords?: (
    inputs: Array<{ english: string; pos: LexiconPos }>
  ) => Promise<Map<string, string | null>>;
}

export interface LexiconEnrichmentStats {
  candidateCount: number;
  validatedCount: number;
  translatedFallbackCount: number;
  elapsedMs: number;
}

function getDeps(deps?: LexiconEnrichmentDeps) {
  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    validateTranslationCandidates: deps?.validateTranslationCandidates ?? validateTranslationCandidatesWithAI,
    translateWords: deps?.translateWords ?? translateWordsWithAI,
  };
}

function normalizePendingCandidates(
  candidates: PendingLexiconEnrichmentCandidate[],
): PendingLexiconEnrichmentCandidate[] {
  const normalized = new Map<string, PendingLexiconEnrichmentCandidate>();

  for (const candidate of candidates) {
    const japaneseHint = normalizeLexiconTranslation(candidate.japaneseHint);
    if (!candidate.lexiconEntryId || !candidate.english.trim() || !japaneseHint) {
      continue;
    }
    normalized.set(candidate.lexiconEntryId, {
      lexiconEntryId: candidate.lexiconEntryId,
      english: candidate.english.trim(),
      pos: candidate.pos,
      japaneseHint,
    });
  }

  return Array.from(normalized.values());
}

async function loadLexiconEntryRow(
  supabaseAdmin: SupabaseClient,
  lexiconEntryId: string,
): Promise<LexiconEntryRow | null> {
  const { data, error } = await supabaseAdmin
    .from('lexicon_entries')
    .select('id, headword, pos, translation_ja')
    .eq('id', lexiconEntryId)
    .maybeSingle<LexiconEntryRow>();

  if (error) {
    throw new Error(`Failed to load lexicon entry for enrichment: ${error.message}`);
  }

  return data ?? null;
}

async function updateLexiconTranslation(
  supabaseAdmin: SupabaseClient,
  lexiconEntryId: string,
  translation: string,
  translationSource: LexiconTranslationSource,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('lexicon_entries')
    .update({
      translation_ja: translation,
      translation_source: translationSource,
    })
    .eq('id', lexiconEntryId);

  if (error) {
    throw new Error(`Failed to update lexicon enrichment translation: ${error.message}`);
  }
}

export async function enqueueLexiconEnrichmentJob(
  source: LexiconEnrichmentJobSource,
  candidates: PendingLexiconEnrichmentCandidate[],
  deps?: Pick<LexiconEnrichmentDeps, 'supabaseAdmin'>,
): Promise<string | null> {
  const normalizedCandidates = normalizePendingCandidates(candidates);
  if (normalizedCandidates.length === 0) {
    return null;
  }

  const supabaseAdmin = deps?.supabaseAdmin ?? getSupabaseAdmin();
  const payload = { candidates: normalizedCandidates };
  const { data, error } = await supabaseAdmin
    .from('lexicon_enrichment_jobs')
    .insert({
      status: 'pending',
      source,
      candidate_count: normalizedCandidates.length,
      payload,
      error_message: null,
      attempt_count: 0,
      processing_started_at: null,
      completed_at: null,
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to enqueue lexicon enrichment job');
  }

  return data.id;
}

export async function triggerLexiconEnrichmentProcessing(
  requestUrl: string,
  jobId?: string,
): Promise<void> {
  const workerAuth = getInternalWorkerAuthorization();
  if (!workerAuth) {
    console.error('[lexicon-enrichment] Missing internal worker token while scheduling worker');
    return;
  }

  const processUrl = createInternalWorkerUrl('/api/lexicon-enrichment/process', requestUrl);
  const response = await fetch(processUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': workerAuth.header,
    },
    body: JSON.stringify(jobId ? { jobId } : {}),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[lexicon-enrichment] Failed to trigger worker', {
      jobId,
      status: response.status,
      body,
    });
  }
}

export async function processLexiconEnrichmentCandidates(
  candidates: PendingLexiconEnrichmentCandidate[],
  deps?: LexiconEnrichmentDeps,
): Promise<LexiconEnrichmentStats> {
  const startedAt = Date.now();
  const normalizedCandidates = normalizePendingCandidates(candidates);
  const { supabaseAdmin, validateTranslationCandidates, translateWords } = getDeps(deps);

  if (normalizedCandidates.length === 0) {
    return {
      candidateCount: 0,
      validatedCount: 0,
      translatedFallbackCount: 0,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const candidateByEntryId = new Map<string, PendingLexiconEnrichmentCandidate>();
  const rowsToValidate: Array<{
    row: LexiconEntryRow;
    candidate: PendingLexiconEnrichmentCandidate;
  }> = [];

  for (const candidate of normalizedCandidates) {
    candidateByEntryId.set(candidate.lexiconEntryId, candidate);
    const row = await loadLexiconEntryRow(supabaseAdmin, candidate.lexiconEntryId);
    if (!row) continue;
    if (normalizeLexiconTranslation(row.translation_ja)) continue;
    rowsToValidate.push({ row, candidate });
  }

  let validatedCount = 0;
  let translatedFallbackCount = 0;

  const validationInputs = rowsToValidate.map(({ row, candidate }) => ({
    english: row.headword || candidate.english,
    pos: row.pos as LexiconPos,
    japaneseHint: candidate.japaneseHint,
  }));
  const validationResults = validationInputs.length > 0
    ? await validateTranslationCandidates(validationInputs)
    : new Map<string, ValidatedTranslationCandidate | null>();
  const fallbackInputs: Array<{ lexiconEntryId: string; english: string; pos: LexiconPos }> = [];

  for (const { row, candidate } of rowsToValidate) {
    const key = buildValidationKey(row.headword || candidate.english, row.pos as LexiconPos, candidate.japaneseHint);
    const validation = validationResults.get(key);

    if (validation?.useHint) {
      const translation = normalizeLexiconTranslation(validation.normalizedJapanese ?? candidate.japaneseHint);
      if (translation) {
        await updateLexiconTranslation(supabaseAdmin, row.id, translation, 'scan');
        validatedCount += 1;
        continue;
      }
    }

    const suggested = normalizeLexiconTranslation(validation?.suggestedJapanese);
    if (suggested) {
      await updateLexiconTranslation(supabaseAdmin, row.id, suggested, 'ai');
      validatedCount += 1;
      continue;
    }

    fallbackInputs.push({
      lexiconEntryId: row.id,
      english: row.headword || candidate.english,
      pos: row.pos as LexiconPos,
    });
  }

  if (fallbackInputs.length > 0) {
    const translations = await translateWords(
      fallbackInputs.map((item) => ({ english: item.english, pos: item.pos })),
    );

    for (const item of fallbackInputs) {
      const translation = normalizeLexiconTranslation(
        translations.get(buildLexiconKey(item.english, item.pos)) ?? null,
      );
      if (!translation) continue;
      await updateLexiconTranslation(supabaseAdmin, item.lexiconEntryId, translation, 'ai');
      translatedFallbackCount += 1;
    }
  }

  return {
    candidateCount: normalizedCandidates.length,
    validatedCount,
    translatedFallbackCount,
    elapsedMs: Date.now() - startedAt,
  };
}
