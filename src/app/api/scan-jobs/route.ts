import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!bearerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken);
    
    if (authError || !user) {
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
      return NextResponse.json({ error: 'この機能はProプラン限定です。' }, { status: 403 });
    }

    if (!scanData.allowed) {
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

    if (usedLegacyColumns) {
      console.warn('[scan-jobs] scan_jobs compatibility fallback used (save_mode/target_project_id missing)');
    }

    // Trigger background processing (fire and forget)
    const processUrl = new URL('/api/scan-jobs/process', request.url);
    fetch(processUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ jobId: String(job.id) }),
    }).catch(err => console.error('Failed to trigger processing:', err));

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
