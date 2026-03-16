import { after, NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { parseJsonWithSchema } from '@/lib/api/validation';
import {
  enqueueLexiconEnrichmentJob,
  triggerLexiconEnrichmentProcessing,
} from '@/lib/lexicon/enrichment-jobs';
import {
  processWordLexiconResolutionWords,
  wordLexiconResolutionPayloadSchema,
  type WordLexiconResolutionDeps,
} from '@/lib/lexicon/word-resolution-jobs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const MAX_ATTEMPTS = 3;
const MAX_JOBS_PER_REQUEST = 3;

const requestSchema = z.object({
  jobId: z.string().uuid().optional(),
}).strict();

type WordLexiconResolutionJobRow = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  source: 'scan' | 'manual';
  word_count: number;
  payload: unknown;
  error_message: string | null;
  attempt_count: number;
  processing_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type WorkerDeps = WordLexiconResolutionDeps & {
  supabaseAdmin?: SupabaseClient;
  maxJobsPerRequest?: number;
  maxAttempts?: number;
};

function getWorkerDeps(deps?: WorkerDeps) {
  return {
    supabaseAdmin: deps?.supabaseAdmin ?? getSupabaseAdmin(),
    maxJobsPerRequest: deps?.maxJobsPerRequest ?? MAX_JOBS_PER_REQUEST,
    maxAttempts: deps?.maxAttempts ?? MAX_ATTEMPTS,
    resolveWords: deps?.resolveWords,
  };
}

async function claimJobById(
  supabaseAdmin: SupabaseClient,
  jobId: string,
): Promise<WordLexiconResolutionJobRow | null> {
  const { data, error } = await supabaseAdmin
    .from('word_lexicon_resolution_jobs')
    .update({
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle<WordLexiconResolutionJobRow>();

  if (error) {
    throw new Error(`Failed to claim word lexicon resolution job: ${error.message}`);
  }

  return data ?? null;
}

async function listPendingJobIds(
  supabaseAdmin: SupabaseClient,
  limit: number,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('word_lexicon_resolution_jobs')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list word lexicon resolution jobs: ${error.message}`);
  }

  return (data ?? []).map((row) => String((row as { id: string }).id));
}

async function markJobCompleted(
  supabaseAdmin: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('word_lexicon_resolution_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Failed to complete word lexicon resolution job: ${error.message}`);
  }
}

async function markJobFailure(
  request: NextRequest,
  job: WordLexiconResolutionJobRow,
  error: unknown,
  deps?: WorkerDeps,
): Promise<'pending' | 'failed'> {
  const { supabaseAdmin, maxAttempts } = getWorkerDeps(deps);
  const attemptCount = job.attempt_count + 1;
  const errorMessage = error instanceof Error ? error.message : 'Word lexicon resolution failed';
  const nextStatus = attemptCount < maxAttempts ? 'pending' : 'failed';

  const { error: updateError } = await supabaseAdmin
    .from('word_lexicon_resolution_jobs')
    .update({
      status: nextStatus,
      attempt_count: attemptCount,
      error_message: errorMessage,
      processing_started_at: null,
      completed_at: nextStatus === 'failed' ? new Date().toISOString() : null,
    })
    .eq('id', job.id);

  if (updateError) {
    throw new Error(`Failed to update failed word lexicon resolution job: ${updateError.message}`);
  }

  if (nextStatus === 'pending') {
    after(async () => {
      const processUrl = new URL('/api/word-lexicon-resolution/process', request.url);
      await fetch(processUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': request.headers.get('authorization') ?? '',
        },
        body: JSON.stringify({ jobId: job.id }),
      }).catch((retryError) => {
        console.error('[word-lexicon-resolution/process] Failed to re-trigger worker', retryError);
      });
    });
  }

  return nextStatus;
}

async function processClaimedJob(
  request: NextRequest,
  job: WordLexiconResolutionJobRow,
  deps?: WorkerDeps,
): Promise<{
  jobId: string;
  status: 'completed' | 'pending' | 'failed';
  stats: Awaited<ReturnType<typeof processWordLexiconResolutionWords>> | null;
}> {
  const { supabaseAdmin, resolveWords } = getWorkerDeps(deps);

  try {
    const parsedPayload = wordLexiconResolutionPayloadSchema.parse(job.payload);
    const stats = await processWordLexiconResolutionWords(parsedPayload.wordIds, {
      supabaseAdmin,
      resolveWords,
      aiTranslatedWordIds: parsedPayload.aiTranslatedWordIds,
    });

    await markJobCompleted(supabaseAdmin, job.id);

    if (stats.pendingEnrichmentCandidates.length > 0) {
      after(async () => {
        try {
          const enrichmentJobId = await enqueueLexiconEnrichmentJob(
            job.source,
            stats.pendingEnrichmentCandidates,
            { supabaseAdmin },
          );
          if (enrichmentJobId) {
            await triggerLexiconEnrichmentProcessing(request.url, enrichmentJobId);
          }
        } catch (enqueueError) {
          console.error('[word-lexicon-resolution/process] Failed to enqueue lexicon enrichment', enqueueError);
        }
      });
    }

    console.log('[word-lexicon-resolution/process] Job completed', {
      jobId: job.id,
      source: job.source,
      word_count: stats.wordCount,
      resolved_count: stats.resolvedCount,
      tag_backfilled_count: stats.tagBackfilledCount,
      skipped_count: stats.skippedCount,
      enrichment_candidate_count: stats.pendingEnrichmentCandidates.length,
      elapsed_ms: stats.elapsedMs,
      has_resolve_override: Boolean(resolveWords),
    });

    return {
      jobId: job.id,
      status: 'completed',
      stats,
    };
  } catch (error) {
    console.error('[word-lexicon-resolution/process] Job failed', {
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

export async function handleWordLexiconResolutionProcessPost(
  request: NextRequest,
  deps?: WorkerDeps,
) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (request.headers.get('authorization') !== `Bearer ${serviceRoleKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonWithSchema(request, requestSchema, {
    invalidMessage: 'Invalid word lexicon resolution job request',
  });
  if (!parsed.ok) {
    return parsed.response;
  }

  const { supabaseAdmin, maxJobsPerRequest } = getWorkerDeps(deps);
  const jobId = parsed.data.jobId;

  try {
    const claimedJobs: WordLexiconResolutionJobRow[] = [];

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
        wordCount: result.stats?.wordCount ?? 0,
        resolvedCount: result.stats?.resolvedCount ?? 0,
        tagBackfilledCount: result.stats?.tagBackfilledCount ?? 0,
        skippedCount: result.stats?.skippedCount ?? 0,
        enrichmentCandidateCount: result.stats?.pendingEnrichmentCandidates.length ?? 0,
        elapsedMs: result.stats?.elapsedMs ?? 0,
      })),
    });
  } catch (error) {
    console.error('[word-lexicon-resolution/process] Route error', error);
    return NextResponse.json({ error: 'Word lexicon resolution processing failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleWordLexiconResolutionProcessPost(request);
}
