import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';

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

const requestSchema = z.object({
  projectTitle: z.string().trim().min(1).max(120),
  scanMode: z.enum(['all', 'circled', 'highlighted', 'eiken', 'idiom', 'wrong']).optional().default('all'),
  eikenLevel: z.string().trim().max(100).nullable().optional(),
  imagePath: z.string().trim().min(1).max(500).optional(),
  imagePaths: z.array(z.string().trim().min(1).max(500)).min(1).max(20).optional(),
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
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: 'Missing required fields',
    });
    if (!parsed.ok) {
      return parsed.response;
    }
    const { projectTitle, scanMode, eikenLevel, imagePath, imagePaths: multiplePaths } = parsed.data;

    // Support both single imagePath and multiple imagePaths
    const imagePaths: string[] = multiplePaths || (imagePath ? [imagePath] : []);

    // Verify all images exist in storage
    for (const imagePath of imagePaths) {
      const fileName = imagePath.split('/').pop();
      const { data: fileData } = await getSupabaseAdmin().storage
        .from('scan-images')
        .list(user.id, { search: fileName });

      if (!fileData || fileData.length === 0) {
        return NextResponse.json({ error: `Image not found: ${fileName}` }, { status: 400 });
      }
    }

    // Create a single scan job with all image paths
    const { data: job, error: insertError } = await getSupabaseAdmin()
      .from('scan_jobs')
      .insert({
        user_id: user.id,
        project_title: projectTitle,
        scan_mode: scanMode || 'all',
        eiken_level: eikenLevel,
        image_path: imagePaths[0], // Primary image (backward compat)
        image_paths: imagePaths,   // All images
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create scan job' }, { status: 500 });
    }

    // Trigger background processing (fire and forget)
    const processUrl = new URL('/api/scan-jobs/process', request.url);
    fetch(processUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch(err => console.error('Failed to trigger processing:', err));

    return NextResponse.json({
      success: true,
      jobId: job.id,
    });

  } catch (error) {
    console.error('Scan job creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
