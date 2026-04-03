import { after, NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createInternalWorkerUrl, getInternalWorkerAuthorization } from '@/lib/api/internal-worker';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { checkAndIncrementScanUsage } from '@/lib/supabase/scan-usage';
import { insertScanJobWithCompat } from '@/lib/supabase/scan-jobs-compat';

// Lazy initialization to avoid build-time errors
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    supabaseAdmin = createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key
    );
  }
  return supabaseAdmin;
}

function scheduleScanJobProcessing(request: NextRequest, jobId: string) {
  const workerAuth = getInternalWorkerAuthorization();
  const processUrl = createInternalWorkerUrl('/api/scan-jobs/process', request.url);

  after(async () => {
    if (!workerAuth) {
      console.error('[scan-jobs] Missing internal worker token while scheduling process route');
      return;
    }

    try {
      const response = await fetch(processUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': workerAuth.header,
        },
        body: JSON.stringify({ jobId }),
        cache: 'no-store',
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('[scan-jobs] Failed to trigger processing', {
          jobId,
          status: response.status,
          body,
        });
        return;
      }

      console.log('[scan-jobs] Processing triggered', { jobId });
    } catch (error) {
      console.error('[scan-jobs] Failed to trigger processing', { jobId, error });
    }
  });
}

const SCAN_JOB_TIMEOUT_MS = 10 * 60 * 1000;
const SCAN_JOB_TIMEOUT_MESSAGE = '処理がタイムアウトしました。もう一度お試しください。';

function isTimedOutJob(job: {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  updated_at: string;
  created_at: string;
}): boolean {
  if (job.status !== 'pending' && job.status !== 'processing') {
    return false;
  }

  const baseTime = Date.parse(job.updated_at || job.created_at);
  if (Number.isNaN(baseTime)) {
    return false;
  }

  return Date.now() - baseTime > SCAN_JOB_TIMEOUT_MS;
}

export async function POST(request: NextRequest) {
  try {
    console.log('[scan-jobs] Legacy request received');
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!bearerToken) {
      console.warn('[scan-jobs] Missing bearer token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken);
    
    if (authError || !user) {
      console.warn('[scan-jobs] Auth failed', { authError: authError?.message ?? null });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get('image') as File;
    const projectTitle = formData.get('projectTitle') as string;
    const scanMode = formData.get('scanMode') as string || 'all';
    const eikenLevel = formData.get('eikenLevel') as string || null;
    const clientPlatformRaw = (formData.get('clientPlatform') as string | null)?.trim().toLowerCase();
    const clientPlatform = clientPlatformRaw === 'ios' ? 'ios' : 'web';
    const targetProjectId = (formData.get('targetProjectId') as string | null)?.trim() || null;

    if (!image || !projectTitle) {
      console.warn('[scan-jobs] Missing form-data fields', {
        hasImage: Boolean(image),
        hasProjectTitle: Boolean(projectTitle),
      });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const requiresPro = scanMode !== 'all';
    const { data: scanData, error: scanError } = await checkAndIncrementScanUsage(supabase, {
      count: 1,
      requirePro: requiresPro,
    });

    if (scanError || !scanData) {
      console.error('Scan limit check error:', scanError);
      return NextResponse.json({ error: 'スキャン制限の確認に失敗しました' }, { status: 500 });
    }

    if (scanData.requires_pro) {
      console.warn('[scan-jobs] Pro-required scan mode blocked', {
        userId: user.id,
        scanMode,
      });
      return NextResponse.json({ error: 'この機能はProプラン限定です。' }, { status: 403 });
    }

    if (!scanData.allowed) {
      console.warn('[scan-jobs] Scan limit reached', {
        userId: user.id,
        currentCount: scanData.current_count,
        limit: scanData.limit,
      });
      return NextResponse.json(
        {
          error: `本日のスキャン上限（${scanData.limit ?? '∞'}回）に達しました。`,
          limitReached: true,
          scanInfo: {
            currentCount: scanData.current_count,
            limit: scanData.limit,
            isPro: scanData.is_pro,
          },
        },
        { status: 429 }
      );
    }

    const isProUser = Boolean(scanData.is_pro);
    const saveMode: 'server_cloud' | 'client_local' =
      clientPlatform === 'ios' && !isProUser ? 'client_local' : 'server_cloud';

    let validatedTargetProjectId: string | null = null;
    if (saveMode === 'server_cloud' && targetProjectId) {
      const { data: project, error: projectError } = await getSupabaseAdmin()
        .from('projects')
        .select('id')
        .eq('id', targetProjectId)
        .eq('user_id', user.id)
        .single();

      if (projectError || !project) {
        console.warn('[scan-jobs] Target project not found', {
          userId: user.id,
          targetProjectId,
        });
        return NextResponse.json({ error: '指定した単語帳が見つかりません。' }, { status: 400 });
      }

      validatedTargetProjectId = project.id;
    }

    // Upload image to Supabase Storage
    const timestamp = Date.now();
    const imagePath = `${user.id}/${timestamp}.${image.name.split('.').pop()}`;
    
    const { error: uploadError } = await getSupabaseAdmin().storage
      .from('scan-images')
      .upload(imagePath, image, {
        contentType: image.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    // Create scan job record
    const { data: job, error: insertError, usedLegacyColumns } = await insertScanJobWithCompat(
      getSupabaseAdmin(),
      {
        user_id: user.id,
        project_title: projectTitle,
        scan_mode: scanMode,
        eiken_level: eikenLevel,
        image_path: imagePath,
        image_paths: [imagePath],
        save_mode: saveMode,
        target_project_id: validatedTargetProjectId,
        status: 'pending',
      },
    );

    if (insertError) {
      console.error('Insert error:', insertError);
      await getSupabaseAdmin().storage.from('scan-images').remove([imagePath]);
      return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
    }
    if (!job || !('id' in job) || !job.id) {
      console.error('Insert error: missing job id in response');
      await getSupabaseAdmin().storage.from('scan-images').remove([imagePath]);
      return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
    }

    if (usedLegacyColumns) {
      console.warn('[scan-jobs] scan_jobs compatibility fallback used (save_mode/target_project_id missing)');
    }

    scheduleScanJobProcessing(request, String(job.id));
    console.log('[scan-jobs] Legacy job created', {
      jobId: String(job.id),
      userId: user.id,
      saveMode,
      targetProjectId: validatedTargetProjectId,
    });

    return NextResponse.json({
      success: true,
      jobId: String(job.id),
      saveMode,
      message: 'Scan started',
    });

  } catch (error) {
    console.error('Scan job creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: Check job status or list recent jobs
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (jobId) {
      const { data: job, error } = await getSupabaseAdmin()
        .from('scan_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .single();

      if (error || !job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      if (job.status === 'pending') {
        console.log('[scan-jobs] Re-triggering pending job from GET', { jobId: job.id });
        scheduleScanJobProcessing(request, String(job.id));
      }

      return NextResponse.json({ job });
    }

    const { data: jobs, error } = await getSupabaseAdmin()
      .from('scan_jobs')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['completed', 'pending', 'processing', 'failed'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }

    const pendingJobs = (jobs || []).filter((job) => job.status === 'pending');
    if (pendingJobs.length > 0) {
      console.log('[scan-jobs] Re-triggering pending jobs from list GET', {
        count: pendingJobs.length,
        jobIds: pendingJobs.map((job) => job.id),
      });
      for (const pendingJob of pendingJobs) {
        scheduleScanJobProcessing(request, String(pendingJob.id));
      }
    }

    const normalizedJobs = (jobs || []) as Array<{
      id: string;
      user_id: string;
      project_id: string | null;
      target_project_id: string | null;
      project_title: string;
      scan_mode: string;
      save_mode: 'server_cloud' | 'client_local';
      image_path: string;
      image_paths: string[] | null;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      result: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const timedOutJobIds = normalizedJobs
      .filter((job) => isTimedOutJob(job))
      .map((job) => job.id);

    if (timedOutJobIds.length > 0) {
      const nowIso = new Date().toISOString();
      const { error: timeoutUpdateError } = await getSupabaseAdmin()
        .from('scan_jobs')
        .update({
          status: 'failed',
          error_message: SCAN_JOB_TIMEOUT_MESSAGE,
          updated_at: nowIso,
        })
        .eq('user_id', user.id)
        .in('id', timedOutJobIds)
        .in('status', ['pending', 'processing']);

      if (timeoutUpdateError) {
        console.error('Failed to mark timed-out scan jobs as failed:', timeoutUpdateError);
      } else {
        const timeoutSet = new Set(timedOutJobIds);
        for (const job of normalizedJobs) {
          if (timeoutSet.has(job.id)) {
            job.status = 'failed';
            job.error_message = SCAN_JOB_TIMEOUT_MESSAGE;
            job.updated_at = nowIso;
          }
        }
      }
    }

    return NextResponse.json({ jobs: normalizedJobs });

  } catch (error) {
    console.error('Scan job fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Acknowledge/dismiss completed job
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const { error } = await getSupabaseAdmin()
      .from('scan_jobs')
      .delete()
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Scan job delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
