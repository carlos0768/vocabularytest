import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getCachedDerivedWordsByHeadword } from '@/lib/derived-words/lexicon';
import { hasDisplayableDerivedWords } from '@/lib/derived-words/format';
import { normalizeHeadword } from '../../../../../shared/lexicon';

/**
 * GET /api/words/derived-words?english=<word>
 *
 * lexicon 共有キャッシュに保存済みの派生語を headword で引いて返す。
 * /api/words/morphology と同じキャッシュ読み取り専用の経路で、AI 生成も
 * コイン消費も行わない。単語帳の単語詳細が `word.derivedWords` を持たない
 * 単語（機能追加前の既存語・派生語オプションをオフで追加した語）を表示時に
 * バックフィルするために使う。
 *
 * 誰かが一度コインを払って生成した派生語は lexicon で全ユーザーが共有するので、
 * ここでの読み取りは無料。まだ誰も生成していない単語は null を返すだけで、
 * このルートから生成が走ることはない。
 */
export async function GET(request: NextRequest) {
  try {
    const english = request.nextUrl.searchParams.get('english')?.trim() ?? '';
    if (!english || english.length > 100) {
      return NextResponse.json(
        { success: false, error: '無効なリクエスト形式です' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = await createRouteHandlerClient(request);
    const { data: { user }, error: authError } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '認証が必要です。ログインしてください。' },
        { status: 401 }
      );
    }

    const headword = normalizeHeadword(english);
    if (!headword) {
      return NextResponse.json({ success: true, derivedWords: null });
    }

    const cached = await getCachedDerivedWordsByHeadword([headword], {
      supabaseAdmin: getSupabaseAdmin(),
    });
    const derivedWords = cached.get(headword);

    return NextResponse.json({
      success: true,
      derivedWords: hasDisplayableDerivedWords(derivedWords) ? derivedWords : null,
    });
  } catch (error) {
    console.error('[words/derived-words] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
