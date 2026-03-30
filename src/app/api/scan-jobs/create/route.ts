import { after, NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
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
  const workerToken = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Use VERCEL_URL to bypass Cloudflare (which strips Authorization headers)
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : request.url;
  const processUrl = new URL('/api/scan-jobs/process', baseUrl);

  after(async () => {
    if (!workerToken) {
      console.error('[scan-jobs/create] Missing SUPABASE_SERVICE_ROLE_KEY while scheduling process route');
      return;
    }

    try {
      const response = await fetch(processUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${workerToken}`,
        },
        body: JSON.stringify({ jobId }),
        cache: 'no-store',
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('[scan-jobs/create] Failed to trigger processing', {
          jobId,
          status: response.status,
          body,
        });
        return;
      }

      console.log('[scan-jobs/create] Processing triggered', { jobId });
    } catch (error) {
      console.error('[scan-jobs/create] Failed to trigger processing', { jobId, error });
    }
  });
}

const requestSchema = z.object({
  projectTitle: z.string().trim().min(1).max(120),
  projectIcon: z.string().trim().max(2_500_000).regex(/^data:image\//, 'projectIcon must be an image data URL').nullable().optional(),
  scanMode: z.enum(['all', 'circled', 'highlighted', 'eiken', 'idiom', 'wrong']).optional().default('all'),
  eikenLevel: z.string().trim().max(100).nullable().optional(),
  imagePath: z.string().trim().min(1).max(500).optional(),
  imagePaths: z.array(z.string().trim().min(1).max(500)).min(1).max(20).optional(),
  aiEnabled: z.boolean().nullable().optional(),
  targetProjectId: z.string().uuid().optional(),
  clientPlatform: z.enum(['ios', 'web']).optional().default('web'),
}).strict().superRefine((value, ctx) => {
  if (!value.imagePath && (!value.imagePaths || value.imagePaths.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'imagePath または imagePaths が必要です',
      path: ['imagePaths'],
    });
  }
});

// Lightweight endpoint: just create job record and trigger processing
// Images are already uploaded directly to Storage by client
export async function POST(request: NextRequest) {
  try {
    console.log('[scan-jobs/create] Request received');
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!bearerToken) {
      console.warn('[scan-jobs/create] Missing bearer token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(bearerToken);

    if (authError || !user) {
      console.warn('[scan-jobs/create] Auth failed', { authError: authError?.message ?? null });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'Missing required fields',
    });
    if (!parsed.ok) {
      console.warn('[scan-jobs/create] Request validation failed');
      return parsed.response;
    }
    const {
      projectTitle,
      projectIcon,
      scanMode,
      eikenLevel,
      imagePath,
      imagePaths: multiplePaths,
      targetProjectId,
      clientPlatform,
    } = parsed.data;

    // Support both single imagePath and multiple imagePaths
    const imagePaths: string[] = multiplePaths || (imagePath ? [imagePath] : []);
    if (imagePaths.length === 0) {
      console.warn('[scan-jobs/create] No image paths provided', { userId: user.id });
      return NextResponse.json({ error: 'imagePaths is required' }, { status: 400 });
    }

    const requiresPro = scanMode !== 'all';

    // Verify all images exist in storage first.
    for (const candidatePath of imagePaths) {
      const fileName = candidatePath.split('/').pop();
      const { data: fileData } = await getSupabaseAdmin().storage
        .from('scan-images')
        .list(user.id, { search: fileName });

      if (!fileData || fileData.length === 0) {
        console.warn('[scan-jobs/create] Uploaded image missing in storage', {
          userId: user.id,
          candidatePath,
        });
        return NextResponse.json({ error: `Image not found: ${fileName}` }, { status: 400 });
      }
    }

    const { data: scanData, error: scanError } = await checkAndIncrementScanUsage(supabase, {
      count: imagePaths.length,
      requirePro: requiresPro,
    });

    if (scanError || !scanData) {
      console.error('Scan limit check error:', scanError);
      return NextResponse.json({ error: 'スキャン制限の確認に失敗しました' }, { status: 500 });
    }

    if (scanData.requires_pro) {
      console.warn('[scan-jobs/create] Pro-required scan mode blocked', {
        userId: user.id,
        scanMode,
      });
      return NextResponse.json({ error: 'この機能はProプラン限定です。' }, { status: 403 });
    }

    if (!scanData.allowed) {
      console.warn('[scan-jobs/create] Scan limit reached', {
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
        console.warn('[scan-jobs/create] Target project not found', {
          userId: user.id,
          targetProjectId,
        });
        return NextResponse.json({ error: '指定した単語帳が見つかりません。' }, { status: 400 });
      }
      validatedTargetProjectId = project.id;
    }

    // Create a single scan job with all image paths
    const { data: job, error: insertError, usedLegacyColumns } = await insertScanJobWithCompat(
      getSupabaseAdmin(),
      {
        user_id: user.id,
        project_title: projectTitle,
        project_icon_image: projectIcon ?? null,
        scan_mode: scanMode || 'all',
        eiken_level: eikenLevel,
        image_path: imagePaths[0], // Primary image (backward compat)
        image_paths: imagePaths,   // All images
        save_mode: saveMode,
        target_project_id: validatedTargetProjectId,
        status: 'pending',
      },
    );

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
    }
    if (!job || !('id' in job) || !job.id) {
      console.error('Insert error: missing job id in response');
      return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
    }

    if (usedLegacyColumns) {
      console.warn('[scan-jobs/create] scan_jobs compatibility fallback used (save_mode/target_project_id missing)');
    }

    scheduleScanJobProcessing(request, String(job.id));
    console.log('[scan-jobs/create] Job created', {
      jobId: String(job.id),
      userId: user.id,
      saveMode,
      imageCount: imagePaths.length,
      targetProjectId: validatedTargetProjectId,
    });

    return NextResponse.json({
      success: true,
      jobId: String(job.id),
      saveMode,
      scanInfo: {
        currentCount: scanData.current_count,
        limit: scanData.limit,
        isPro: scanData.is_pro,
      },
    });

  } catch (error) {
    console.error('Scan job creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
