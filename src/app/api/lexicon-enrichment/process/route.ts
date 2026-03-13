import { after, NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  lexiconEnrichmentPayloadSchema,
  processLexiconEnrichmentCandidates,
  triggerLexiconEnrichmentProcessing,
  type LexiconEnrichmentDeps,
  type LexiconEnrichmentStats,
} from '@/lib/lexicon/enrichment-jobs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_ATTEMPTS = 3;
const MAX_JOBS_PER_REQUEST = 3;

const requestSchema = z.object({
  jobId: z.string().uuid().optional(),
}).strict();

type LexiconEnrichmentJobRow = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source: 'scan' | 'manual';
  candidate_count: number;
  payload: unknown;
  error_message: string | null;
  attempt_count: number;
  processing_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkerDeps = LexiconEnrichmentDeps & {
  supabaseAdmin?: SupabaseClient;
  maxJobsPerRequest?: number;
  maxAttempts?: number;
};

function getWorkerDeps(deps?: WorkerDeps) {
  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    maxJobsPerRequest: deps?.maxJobsPerRequest ?? MAX_JOBS_PER_REQUEST,
    maxAttempts: deps?.maxAttempts ?? MAX_ATTEMPTS,
    validateTranslationCandidates: deps?.validateTranslationCandidates,
    translateWords: deps?.translateWords,
  };
}

async function claimJobById(
  supabaseAdmin: SupabaseClient,
  jobId: string,
): Promise<LexiconEnrichmentJobRow | null> {
  const { data, error } = await supabaseAdmin
    .from('lexicon_enrichment_jobs')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle<LexiconEnrichmentJobRow>();

  if (error) {
    throw new Error(`Failed to claim lexicon enrichment job: ${error.message}`);
  }

  return data ?? null;
}

async function listPendingJobIds(
  supabaseAdmin: SupabaseClient,
  limit: number,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('lexicon_enrichment_jobs')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list lexicon enrichment jobs: ${error.message}`);
  }

  return (data ?? []).map((row) => String((row as { id: string }).id));
}

async function markJobCompleted(
  supabaseAdmin: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('lexicon_enrichment_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to complete lexicon enrichment job: ${error.message}`);
  }
}

async function markJobFailure(
  request: NextRequest,
  job: LexiconEnrichmentJobRow,
  error: unknown,
  deps?: WorkerDeps,
): Promise<'pending' | 'failed'> {
  const { supabaseAdmin, maxAttempts } = getWorkerDeps(deps);
  const attemptCount = job.attempt_count + 1;
  const errorMessage = error instanceof Error ? error.message : 'Lexicon enrichment failed';
  const nextStatus = attemptCount < maxAttempts ? 'pending' : 'failed';

  const { error: updateError } = await supabaseAdmin
    .from('lexicon_enrichment_jobs')
    .update({
      status: nextStatus,
      attempt_count: attemptCount,
      error_message: errorMessage,
      processing_started_at: null,
      completed_at: nextStatus === 'failed' ? new Date().toISOString() : null,
    })
    .eq('id', job.id);

  if (updateError) {
    throw new Error(`Failed to update failed lexicon enrichment job: ${updateError.message}`);
  }

  if (nextStatus === 'pending') {
    after(async () => {
      await triggerLexiconEnrichmentProcessing(request.url, job.id);
    });
  }

  return nextStatus;
}

async function processClaimedJob(
  request: NextRequest,
  job: LexiconEnrichmentJobRow,
  deps?: WorkerDeps,
): Promise<{
  jobId: string;
  status: 'completed' | 'pending' | 'failed';
  stats: LexiconEnrichmentStats | null;
}> {
  const { supabaseAdmin, validateTranslationCandidates, translateWords } = getWorkerDeps(deps);

  try {
    const parsedPayload = lexiconEnrichmentPayloadSchema.parse(job.payload);
    const stats = await processLexiconEnrichmentCandidates(parsedPayload.candidates, {
      supabaseAdmin,
      validateTranslationCandidates,
      translateWords,
    });

    await markJobCompleted(supabaseAdmin, job.id);
    console.log('[lexicon-enrichment/process] Job completed', {
      jobId: job.id,
      source: job.source,
      candidate_count: stats.candidateCount,
      validated_count: stats.validatedCount,
      translated_fallback_count: stats.translatedFallbackCount,
      elapsed_ms: stats.elapsedMs,
    });

    return {
      jobId: job.id,
      status: 'completed',
      stats,
    };
  } catch (error) {
    console.error('[lexicon-enrichment/process] Job failed', {
      jobId: job.id,
      error,
    });
    const status = await markJobFailure(request, job, error, deps);
    return {
      jobId: job.id,
      status,
      stats: null,
    };
  }
}

export async function handleLexiconEnrichmentProcessPost(
  request: NextRequest,
  deps?: WorkerDeps,
) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (request.headers.get('authorization') !== `Bearer ${serviceRoleKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonWithSchema(request, requestSchema, {
    invalidMessage: 'Invalid lexicon enrichment job request',
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const { supabaseAdmin, maxJobsPerRequest } = getWorkerDeps(deps);
  const jobId = parsed.data.jobId;

  try {
    const claimedJobs: LexiconEnrichmentJobRow[] = [];

    if (jobId) {
      const claimed = await claimJobById(supabaseAdmin, jobId);
      if (claimed) {
        claimedJobs.push(claimed);
      }
    } else {
      const pendingIds = await listPendingJobIds(supabaseAdmin, maxJobsPerRequest);
      for (const pendingId of pendingIds) {
        const claimed = await claimJobById(supabaseAdmin, pendingId);
        if (claimed) {
          claimedJobs.push(claimed);
        }
      }
    }

    if (claimedJobs.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
      });
    }

    const results = [];
    for (const claimedJob of claimedJobs) {
      results.push(await processClaimedJob(request, claimedJob, deps));
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results: results.map((result) => ({
        jobId: result.jobId,
        status: result.status,
        candidateCount: result.stats?.candidateCount ?? 0,
        validatedCount: result.stats?.validatedCount ?? 0,
        translatedFallbackCount: result.stats?.translatedFallbackCount ?? 0,
        elapsedMs: result.stats?.elapsedMs ?? 0,
      })),
    });
  } catch (error) {
    console.error('[lexicon-enrichment/process] Route error', error);
    return NextResponse.json({ error: 'Lexicon enrichment processing failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleLexiconEnrichmentProcessPost(request);
}
