import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * POST /api/grammar/favorite (Pro限定)
 *
 * 語法問題集の保存(お気に入り)状態を切り替える。
 * grammar_books は本人限定RLSのため Bearer/cookie スコープの client で更新する。
 */

const requestSchema = z.object({
  bookId: z.string().uuid(),
  isFavorite: z.boolean(),
}).strict();

type GrammarFavoriteDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarFavoriteDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarFavoritePost(
  request: NextRequest,
  deps: GrammarFavoriteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効なリクエストです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { data, error } = await auth.supabase
      .from('grammar_books')
      .update({ is_favorite: parsed.data.isFavorite })
      .eq('id', parsed.data.bookId)
      .eq('user_id', auth.user.id)
      .select('id,is_favorite')
      .maybeSingle();

    if (error) {
      console.error('[grammar/favorite] update failed:', error.message);
      return NextResponse.json({ success: false, error: '保存に失敗しました' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ success: false, error: '指定した問題集にアクセスできません' }, { status: 403 });
    }

    return NextResponse.json({ success: true, isFavorite: data.is_favorite as boolean });
  } catch (error) {
    console.error('[grammar/favorite] error:', error);
    return NextResponse.json({ success: false, error: '保存に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleGrammarFavoritePost(request);
}
