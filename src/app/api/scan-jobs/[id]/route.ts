import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ScanJob } from '@/types';

// GET: スキャンジョブの状態を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    // ジョブを取得
    const { data: job, error } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !job) {
      return NextResponse.json({ success: false, error: 'ジョブが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      job: job as ScanJob,
    });
  } catch (error) {
    console.error('Scan job fetch error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

// DELETE: スキャンジョブを削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    // ジョブを取得（画像パスを取得するため）
    const { data: job, error: fetchError } = await supabase
      .from('scan_jobs')
      .select('image_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ success: false, error: 'ジョブが見つかりません' }, { status: 404 });
    }

    // 画像を削除
    if (job.image_path) {
      await supabase.storage.from('scan-images').remove([job.image_path]);
    }

    // ジョブを削除
    const { error: deleteError } = await supabase
      .from('scan_jobs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Job delete error:', deleteError);
      return NextResponse.json({ success: false, error: 'ジョブの削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Scan job delete error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
