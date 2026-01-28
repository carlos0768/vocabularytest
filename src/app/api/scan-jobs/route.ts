import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateScanJobRequest, ScanJob } from '@/types';

// POST: スキャンジョブを作成
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const body: CreateScanJobRequest = await request.json();
    const { image, scanMode, eikenLevel, projectId, projectTitle } = body;

    if (!image) {
      return NextResponse.json({ success: false, error: '画像が必要です' }, { status: 400 });
    }

    // base64からバイナリに変換
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // ファイル名を生成
    const fileName = `${user.id}/${Date.now()}.jpg`;

    // Supabase Storageにアップロード
    const { error: uploadError } = await supabase.storage
      .from('scan-images')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      console.error('Upload details:', { fileName, userId: user.id, bucketName: 'scan-images' });
      return NextResponse.json({
        success: false,
        error: '画像のアップロードに失敗しました',
        details: uploadError.message
      }, { status: 500 });
    }

    // スキャンジョブを作成
    const { data: job, error: insertError } = await supabase
      .from('scan_jobs')
      .insert({
        user_id: user.id,
        status: 'pending',
        scan_mode: scanMode || 'all',
        eiken_level: eikenLevel || null,
        project_id: projectId || null,
        project_title: projectTitle || null,
        image_path: fileName,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Job insert error:', insertError);
      console.error('Insert details:', { userId: user.id, scanMode, fileName });
      // アップロードした画像を削除
      await supabase.storage.from('scan-images').remove([fileName]);
      return NextResponse.json({
        success: false,
        error: 'ジョブの作成に失敗しました',
        details: insertError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      job: job as ScanJob,
    });
  } catch (error) {
    console.error('Scan job creation error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

// GET: 未完了のスキャンジョブ一覧を取得
export async function GET() {
  try {
    const supabase = await createClient();

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    // 未完了のジョブを取得（pending, processing）
    // 24時間以内のジョブのみ
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing', 'completed'])
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Jobs fetch error:', error);
      return NextResponse.json({ success: false, error: 'ジョブの取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      jobs: jobs as ScanJob[],
    });
  } catch (error) {
    console.error('Scan jobs fetch error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
