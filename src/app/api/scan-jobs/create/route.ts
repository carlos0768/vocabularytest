import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service role client for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.startsWith('http') 
    ? process.env.NEXT_PUBLIC_SUPABASE_URL! 
    : `https://${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Lightweight endpoint: just create job record and trigger processing
// Image is already uploaded directly to Storage by client
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { imagePath, projectTitle, scanMode, eikenLevel } = await request.json();

    if (!imagePath || !projectTitle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the image exists in storage
    const { data: fileData } = await supabaseAdmin.storage
      .from('scan-images')
      .list(user.id, { search: imagePath.split('/').pop() });

    if (!fileData || fileData.length === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 400 });
    }

    // Create scan job record
    const { data: job, error: insertError } = await supabaseAdmin
      .from('scan_jobs')
      .insert({
        user_id: user.id,
        project_title: projectTitle,
        scan_mode: scanMode || 'all',
        eiken_level: eikenLevel,
        image_path: imagePath,
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
