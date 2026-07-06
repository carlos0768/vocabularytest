import { after, NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { readSingleLineEnv } from '@/lib/env';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { consumeScanGate } from '@/lib/coins/scan-gate';
import { refundScanCoinsForJob } from '@/lib/coins/refund';
import { insertScanJobWithCompat } from '@/lib/supabase/scan-jobs-compat';
import { resolveScanJobSaveMode } from '@/lib/scan/job-create-contract';
import {
  EXTRACT_MODES,
  getPrimaryExtractMode,
  normalizeExtractModes,
  type ExtractMode,
} from '@/lib/scan/mode-provider';
import { randomUUID } from 'crypto';
import { processJobById } from '../process/route';

export const maxDuration = 300;

// Lazy initialization to avoid build-time errors
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
    const key = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');
    supabaseAdmin = createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key
    );
  }
  return supabaseAdmin;
}

function scheduleScanJobProcessing(jobId: string, scanModesOverride?: ExtractMode[]) {
  after(async () => {
    try {
      console.log('[scan-jobs/create] Direct processing started', { jobId });
      await processJobById(jobId, { scanModesOverride });
      console.log('[scan-jobs/create] Direct processing completed', { jobId });
    } catch (error) {
      console.error('[scan-jobs/create] Direct processing failed', { jobId, error });
    }
  });
}

const requestSchema = z.object({
  projectTitle: z.string().trim().min(1).max(120),
  projectIcon: z.string().trim().max(2_500_000).regex(/^data:image\//, 'projectIcon must be an image data URL').nullable().optional(),
  scanMode: z.enum(EXTRACT_MODES).optional().default('all'),
  scanModes: z.array(z.enum(EXTRACT_MODES)).min(1).max(EXTRACT_MODES.length).optional(),
  eikenLevel: z.string().trim().max(100).nullable().optional(),
  imagePath: z.string().trim().min(1).max(500).optional(),
  imagePaths: z.array(z.string().trim().min(1).max(500)).min(1).max(20).optional(),
  aiEnabled: z.boolean().nullable().optional(),
  targetProjectId: z.string().uuid().optional(),
  clientPlatform: z.enum(['android', 'ios', 'web']).optional().default('web'),
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
  // gate通過後（=コイン消費後）にジョブ行を残せず失敗した場合の返還キー
  let consumedJobId: string | null = null;
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
      scanModes: requestedScanModes,
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

    const scanModes = normalizeExtractModes(requestedScanModes, [scanMode]);
    const primaryScanMode = getPrimaryExtractMode(scanModes);
    // コイン消費(consume)がジョブINSERTより先に走るため、ジョブIDを事前生成して
    // 消費台帳とジョブ行を同じIDで紐づける（失敗時の返還キーになる）。
    const jobId = randomUUID();

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

    const gate = await consumeScanGate(supabase, {
      modes: scanModes,
      imageCount: imagePaths.length,
      scanJobId: jobId,
    });

    if (!gate.ok) {
      console.warn('[scan-jobs/create] Scan gate blocked', {
        userId: user.id,
        scanModes,
        status: gate.status,
      });
      if (gate.status === 500) {
        // RPCコミット後に応答だけ失われた可能性に備えたベストエフォート返還（冪等・no_consumeなら無害）
        await refundScanCoinsForJob(jobId, getSupabaseAdmin());
      }
      return NextResponse.json(gate.body, { status: gate.status });
    }
    consumedJobId = jobId;

    const isProUser = Boolean(gate.scanInfo.isPro);
    const saveMode = resolveScanJobSaveMode({ clientPlatform, isProUser });

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
        await refundScanCoinsForJob(jobId, getSupabaseAdmin());
        return NextResponse.json({ error: '指定した単語帳が見つかりません。' }, { status: 400 });
      }
      validatedTargetProjectId = project.id;
    }

    // Create a single scan job with all image paths
    const { data: job, error: insertError, usedLegacyColumns } = await insertScanJobWithCompat(
      getSupabaseAdmin(),
      {
        id: jobId,
        user_id: user.id,
        project_title: projectTitle,
        project_icon_image: projectIcon ?? null,
        scan_mode: primaryScanMode,
        scan_modes: scanModes,
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
      // ジョブ行を作れなかった場合、消費したコインを取り残さない
      await refundScanCoinsForJob(jobId, getSupabaseAdmin());
      return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
    }
    if (!job || !('id' in job) || !job.id) {
      console.error('Insert error: missing job id in response');
      await refundScanCoinsForJob(jobId, getSupabaseAdmin());
      return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
    }

    // ジョブ行が残った後の返還は processJobById（失敗2経路）とタイムアウト安全網が担う
    consumedJobId = null;

    if (usedLegacyColumns) {
      console.warn('[scan-jobs/create] scan_jobs compatibility fallback used (save_mode/target_project_id missing)');
    }

    scheduleScanJobProcessing(String(job.id), scanModes);
    console.log('[scan-jobs/create] Job created', {
      jobId: String(job.id),
      userId: user.id,
      saveMode,
      scanModes,
      imageCount: imagePaths.length,
      targetProjectId: validatedTargetProjectId,
    });

    return NextResponse.json({
      success: true,
      jobId: String(job.id),
      saveMode,
      scanInfo: {
        currentCount: gate.scanInfo.currentCount,
        limit: gate.scanInfo.limit,
        isPro: gate.scanInfo.isPro,
      },
      // フラグオフ時（null）はキー自体を出さず、従来のレスポンスと同一形状を保つ
      ...(gate.coinInfo ? { coinInfo: gate.coinInfo } : {}),
    });

  } catch (error) {
    console.error('Scan job creation error:', error);
    // 消費済みかつジョブ行が残っていない失敗はここで返還する（冪等）
    if (consumedJobId) {
      await refundScanCoinsForJob(consumedJobId, getSupabaseAdmin());
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
