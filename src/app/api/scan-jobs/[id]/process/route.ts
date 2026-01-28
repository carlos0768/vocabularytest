import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractWordsFromImage, extractCircledWordsFromImage, extractHighlightedWordsFromImage, extractEikenWordsFromImage, extractIdiomsFromImage } from '@/lib/ai';
import { AI_CONFIG } from '@/lib/ai/config';
import type { ScanJob, ScanMode } from '@/types';
import type { EikenLevel } from '@/app/api/extract/route';

// POST: スキャンジョブを処理
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    // ジョブを取得
    const { data: job, error: fetchError } = await supabase
      .from('scan_jobs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ success: false, error: 'ジョブが見つかりません' }, { status: 404 });
    }

    const scanJob = job as ScanJob;

    // 既に処理中または完了している場合はスキップ
    if (scanJob.status === 'processing') {
      return NextResponse.json({ success: true, job: scanJob, message: '処理中です' });
    }
    if (scanJob.status === 'completed') {
      return NextResponse.json({ success: true, job: scanJob, message: '既に完了しています' });
    }
    if (scanJob.status === 'failed') {
      // 再試行の場合はpendingに戻す
      await supabase
        .from('scan_jobs')
        .update({ status: 'pending', error_message: null })
        .eq('id', id);
    }

    // ステータスをprocessingに更新
    await supabase
      .from('scan_jobs')
      .update({ status: 'processing' })
      .eq('id', id);

    // Supabase Storageから画像を取得
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('scan-images')
      .download(scanJob.image_path);

    if (downloadError || !imageData) {
      await updateJobStatus(supabase, id, 'failed', '画像の取得に失敗しました');
      return NextResponse.json({ success: false, error: '画像の取得に失敗しました' }, { status: 500 });
    }

    // BlobをBase64に変換
    const arrayBuffer = await imageData.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const image = `data:image/jpeg;base64,${base64}`;

    // 抽出処理を実行
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const mode = scanJob.scan_mode as ScanMode;
    const eikenLevel = scanJob.eiken_level as EikenLevel;

    let result;

    try {
      if (mode === 'idiom') {
        const idiomsProvider = AI_CONFIG.extraction.idioms.provider;
        const idiomsApiKey = idiomsProvider === 'gemini' ? geminiApiKey : openaiApiKey;
        if (!idiomsApiKey) throw new Error('APIキーが設定されていません');
        result = await extractIdiomsFromImage(image, idiomsApiKey);
      } else if (mode === 'eiken') {
        if (!geminiApiKey || !openaiApiKey) throw new Error('APIキーが設定されていません');
        if (!eikenLevel) throw new Error('英検レベルが指定されていません');
        result = await extractEikenWordsFromImage(image, geminiApiKey, openaiApiKey, eikenLevel);
      } else if (mode === 'circled') {
        if (!geminiApiKey) throw new Error('Gemini APIキーが設定されていません');
        result = await extractCircledWordsFromImage(image, geminiApiKey, {});
      } else if (mode === 'highlighted') {
        if (!geminiApiKey) throw new Error('Gemini APIキーが設定されていません');
        result = await extractHighlightedWordsFromImage(image, geminiApiKey);
      } else {
        // Default 'all' mode
        const wordsProvider = AI_CONFIG.extraction.words.provider;
        const wordsApiKey = wordsProvider === 'gemini' ? geminiApiKey : openaiApiKey;
        if (!wordsApiKey) throw new Error('APIキーが設定されていません');

        // Proユーザーかどうかを確認
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.id)
          .single();
        const isPro = subscription?.status === 'active';

        result = await extractWordsFromImage(image, wordsApiKey, {
          includeExamples: isPro,
        });
      }

      if (!result.success) {
        await updateJobStatus(supabase, id, 'failed', result.error || '抽出に失敗しました');
        return NextResponse.json({ success: false, error: result.error }, { status: 422 });
      }

      // 成功: 結果を保存
      const { data: updatedJob } = await supabase
        .from('scan_jobs')
        .update({
          status: 'completed',
          result: result.data.words,
        })
        .eq('id', id)
        .select()
        .single();

      // 画像を削除（処理完了後）
      await supabase.storage.from('scan-images').remove([scanJob.image_path]);

      return NextResponse.json({
        success: true,
        job: updatedJob as ScanJob,
      });
    } catch (processingError) {
      console.error('Processing error:', processingError);
      const errorMessage = processingError instanceof Error ? processingError.message : '処理中にエラーが発生しました';
      await updateJobStatus(supabase, id, 'failed', errorMessage);
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
  } catch (error) {
    console.error('Scan job process error:', error);
    // ジョブを失敗状態に更新
    await updateJobStatus(supabase, id, 'failed', '予期しないエラーが発生しました');
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

// ヘルパー関数: ジョブステータスを更新
async function updateJobStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  status: 'failed' | 'completed',
  errorMessage?: string
) {
  await supabase
    .from('scan_jobs')
    .update({
      status,
      error_message: errorMessage || null,
    })
    .eq('id', jobId);
}
