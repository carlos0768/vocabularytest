import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getCachedMorphologyByHeadword } from '@/lib/morphology/lexicon';
import { hasDisplayableMorphology } from '@/lib/morphology/format';
import { normalizeHeadword } from '../../../../../shared/lexicon';

/**
 * GET /api/words/morphology?english=<word>
 *
 * lexicon 共有キャッシュに保存済みの語源解析を headword で引いて返す。
 * リール配信（/api/reels）と同じキャッシュ読み取り専用の経路で、AI 生成も
 * コイン消費も行わない。単語帳の単語詳細が `word.morphology` を持たない
 * 単語（語源解析がレスポンスに間に合わなかった手動追加語・機能追加前の
 * 既存語）を表示時にバックフィルするために使う。
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
      return NextResponse.json({ success: true, morphology: null });
    }

    const cached = await getCachedMorphologyByHeadword([headword], {
      supabaseAdmin: getSupabaseAdmin(),
    });
    const morphology = cached.get(headword);

    return NextResponse.json({
      success: true,
      morphology: hasDisplayableMorphology(morphology) ? morphology : null,
    });
  } catch (error) {
    console.error('[words/morphology] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: '予期しないエラーが発生しました' },
      { status: 500 }
    );
  }
}
