import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { batchGenerateEmbeddings } from '@/lib/embeddings';

const BATCH_SIZE = 50; // 一度に処理する単語数

/**
 * POST /api/embeddings/sync
 *
 * ユーザーの単語にembeddingを生成・保存するAPI
 * Pro限定機能（VectorDB検索を有効にするため）
 *
 * リクエストボディ:
 * - wordIds?: string[] - 特定の単語IDのみを処理（省略時は全てembeddingがない単語を処理）
 * - limit?: number - 処理する単語数の上限（デフォルト: 50）
 */
export async function POST(request: NextRequest) {
  try {
    // ============================================
    // 1. AUTHENTICATION CHECK
    // ============================================
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    // ============================================
    // 2. CHECK PRO SUBSCRIPTION
    // ============================================
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (!subscription || subscription.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Embedding同期はProプラン限定機能です。' },
        { status: 403 }
      );
    }

    // ============================================
    // 3. PARSE REQUEST BODY
    // ============================================
    let body: { wordIds?: string[]; limit?: number } = {};
    try {
      body = await request.json();
    } catch {
      // 空ボディの場合はデフォルト値を使用
    }

    const limit = Math.min(body.limit || BATCH_SIZE, BATCH_SIZE);

    // ============================================
    // 4. GET WORDS WITHOUT EMBEDDINGS
    // ============================================
    let wordsToProcess: { id: string; english: string }[] = [];

    if (body.wordIds && body.wordIds.length > 0) {
      // 特定のwordIdが指定された場合
      const { data: words, error: wordsError } = await supabase
        .from('words')
        .select('id, english')
        .in('id', body.wordIds)
        .is('embedding', null);

      if (wordsError) {
        console.error('Failed to fetch words:', wordsError);
        return NextResponse.json(
          { success: false, error: '単語の取得に失敗しました' },
          { status: 500 }
        );
      }

      wordsToProcess = words || [];
    } else {
      // embeddingがない単語をすべて取得
      const { data: words, error: wordsError } = await supabase.rpc(
        'get_words_without_embedding',
        {
          user_id_filter: user.id,
          limit_count: limit,
        }
      );

      if (wordsError) {
        console.error('Failed to fetch words without embedding:', wordsError);
        return NextResponse.json(
          { success: false, error: '単語の取得に失敗しました' },
          { status: 500 }
        );
      }

      wordsToProcess = words || [];
    }

    // Filter out words with empty english text
    wordsToProcess = wordsToProcess.filter((w) => w.english && w.english.trim().length > 0);

    if (wordsToProcess.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'すべての単語にembeddingが設定されています',
        processed: 0,
      });
    }

    // ============================================
    // 5. GENERATE EMBEDDINGS IN BATCH
    // ============================================
    const texts = wordsToProcess.map((w) => w.english.trim());
    const embeddings = await batchGenerateEmbeddings(texts);

    // ============================================
    // 6. UPDATE WORDS WITH EMBEDDINGS
    // ============================================
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < wordsToProcess.length; i++) {
      const word = wordsToProcess[i];
      const embedding = embeddings[i];

      try {
        const { error: updateError } = await supabase.rpc('update_word_embedding', {
          word_id: word.id,
          new_embedding: embedding,
        });

        if (updateError) {
          console.error(`Failed to update embedding for word ${word.id}:`, updateError);
          failureCount++;
        } else {
          successCount++;
        }
      } catch (error) {
        console.error(`Failed to update embedding for word ${word.id}:`, error);
        failureCount++;
      }
    }

    // ============================================
    // 7. RETURN SUCCESS RESPONSE
    // ============================================
    return NextResponse.json({
      success: true,
      message: `${successCount}件のembeddingを生成しました`,
      processed: successCount,
      failed: failureCount,
      remaining: await getRemainingCount(supabase, user.id),
    });
  } catch (error) {
    console.error('Embedding sync API error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}

// embeddingがない単語の残り数を取得
async function getRemainingCount(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  userId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)
      .eq('project_id', await getProjectIdsForUser(supabase, userId));

    if (error) return 0;
    return data?.length || 0;
  } catch {
    return 0;
  }
}

// ユーザーのプロジェクトIDを取得（RLSで代替可能だが明示的に）
async function getProjectIdsForUser(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

  return data?.map((p) => p.id) || [];
}

/**
 * GET /api/embeddings/sync
 *
 * embeddingがない単語の数を取得
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です' },
        { status: 401 }
      );
    }

    // embeddingがない単語の数を取得
    const { data: words } = await supabase.rpc('get_words_without_embedding', {
      user_id_filter: user.id,
      limit_count: 1000, // カウント用に十分大きな数
    });

    const count = words?.length || 0;

    return NextResponse.json({
      success: true,
      wordsWithoutEmbedding: count,
      needsSync: count > 0,
    });
  } catch (error) {
    console.error('Embedding sync status error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
