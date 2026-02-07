import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { batchGenerateEmbeddings } from '@/lib/embeddings';

const BATCH_SIZE = 100;

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * POST /api/embeddings/rebuild
 *
 * 管理者用: 全ユーザーの全単語のembeddingを一括再生成
 * ADMIN_SECRET ヘッダーで認証
 */
export async function POST(request: NextRequest) {
  try {
    // Admin認証
    const adminSecret = request.headers.get('x-admin-secret');
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getAdminClient();

    // embeddingがない全単語を取得
    const { data: words, error } = await supabase
      .from('words')
      .select('id, english, japanese')
      .is('embedding', null)
      .not('english', 'is', null)
      .neq('english', '')
      .limit(BATCH_SIZE);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!words || words.length === 0) {
      // 残り数を確認
      const { count } = await supabase
        .from('words')
        .select('id', { count: 'exact', head: true })
        .is('embedding', null);

      return NextResponse.json({
        success: true,
        message: 'すべての単語にembeddingが設定されています',
        processed: 0,
        remaining: count || 0,
        done: true,
      });
    }

    // バイリンガルテキストを生成
    const texts = words.map((w) => {
      const en = w.english.trim();
      const ja = w.japanese?.trim();
      return ja ? `${en} ${ja}` : en;
    });

    // embedding生成
    const embeddings = await batchGenerateEmbeddings(texts);

    // DB更新
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < words.length; i++) {
      const { error: updateError } = await supabase.rpc('update_word_embedding', {
        word_id: words[i].id,
        new_embedding: embeddings[i],
      });

      if (updateError) {
        failureCount++;
      } else {
        successCount++;
      }
    }

    // 残り数を取得
    const { count: remaining } = await supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);

    return NextResponse.json({
      success: true,
      processed: successCount,
      failed: failureCount,
      remaining: remaining || 0,
      done: (remaining || 0) === 0,
    });
  } catch (error) {
    console.error('Embedding rebuild error:', error);
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
