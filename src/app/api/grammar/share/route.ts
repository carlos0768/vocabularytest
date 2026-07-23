import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * POST /api/grammar/share (Pro限定)
 *
 * 自分の語法問題集に共有IDを発行する (既に発行済みならそれを返す)。
 * share_id の更新は本人限定RLSの範囲内なので、Bearer/cookie スコープの
 * クライアントで完結する (service-role 不要)。
 */

const requestSchema = z.object({
  bookId: z.string().uuid(),
}).strict();

type ShareDeps = {
  requirePro: typeof requireProUser;
  generateShareId: () => string;
};

const defaultDeps: ShareDeps = {
  requirePro: requireProUser,
  generateShareId: () => randomBytes(9).toString('base64url'),
};

export async function handleGrammarSharePost(
  request: NextRequest,
  deps: ShareDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '問題集を指定してください',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { data: book, error: bookError } = await auth.supabase
      .from('grammar_books')
      .select('id,share_id')
      .eq('id', parsed.data.bookId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (bookError) {
      console.error('[grammar/share] book lookup failed:', bookError.message);
      return NextResponse.json({ success: false, error: '共有の作成に失敗しました' }, { status: 500 });
    }
    if (!book) {
      return NextResponse.json({ success: false, error: '指定した問題集にアクセスできません' }, { status: 403 });
    }

    let shareId = (book.share_id as string | null) ?? null;
    if (!shareId) {
      shareId = deps.generateShareId();
      const { error: updateError } = await auth.supabase
        .from('grammar_books')
        .update({ share_id: shareId })
        .eq('id', book.id)
        .eq('user_id', auth.user.id);

      if (updateError) {
        console.error('[grammar/share] share_id update failed:', updateError.message);
        return NextResponse.json({ success: false, error: '共有の作成に失敗しました' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      shareId,
      sharePath: `/grammar/share/${shareId}`,
    });
  } catch (error) {
    console.error('[grammar/share] error:', error);
    return NextResponse.json({ success: false, error: '共有の作成に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleGrammarSharePost(request);
}
