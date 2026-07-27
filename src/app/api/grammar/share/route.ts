import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listMyPublicGrammarBooks, unpublishGrammarBook } from '../shared-grammar-books';

/**
 * POST   /api/grammar/share (Pro限定)
 *   自分の語法問題集に共有IDを発行する (既に発行済みならそれを返す)。
 *   publish: true のときは共有ページ (/shared) の一覧にも公開する。
 * GET    /api/grammar/share — 自分が共有ページに公開している問題集の一覧
 * DELETE /api/grammar/share?bookId=... — 公開を停止する (共有リンクも失効)
 *
 * share_id の更新は本人限定RLSの範囲内なので、Bearer/cookie スコープの
 * クライアントで完結する (service-role 不要)。一覧・停止は Pro が切れた
 * ユーザーでも操作できるよう、ログインのみを条件にする。
 */

const requestSchema = z.object({
  bookId: z.string().uuid(),
  /** 共有ページの一覧に載せるか (false ならリンク共有のみ) */
  publish: z.boolean().optional(),
}).strict();

const bookIdSchema = z.string().uuid();

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

    const publish = parsed.data.publish === true;

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

    const existingShareId = (book.share_id as string | null) ?? null;
    const shareId = existingShareId ?? deps.generateShareId();

    // 公開のときは share_id が既にあっても is_public を立て直す必要がある。
    if (!existingShareId || publish) {
      const { error: updateError } = await auth.supabase
        .from('grammar_books')
        .update({
          share_id: shareId,
          ...(publish ? { is_public: true, published_at: new Date().toISOString() } : {}),
        })
        .eq('id', book.id)
        .eq('user_id', auth.user.id);

      if (updateError) {
        console.error('[grammar/share] share_id update failed:', updateError.message);
        return NextResponse.json(
          { success: false, error: publish ? '共有ページへの公開に失敗しました' : '共有の作成に失敗しました' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      shareId,
      sharePath: `/grammar/share/${shareId}`,
      isPublic: publish,
    });
  } catch (error) {
    console.error('[grammar/share] error:', error);
    return NextResponse.json({ success: false, error: '共有の作成に失敗しました' }, { status: 500 });
  }
}

type MyShareDeps = {
  requireAuth: typeof requireAuthenticatedUser;
  listMine: typeof listMyPublicGrammarBooks;
  unpublish: typeof unpublishGrammarBook;
};

const defaultMyShareDeps: MyShareDeps = {
  requireAuth: requireAuthenticatedUser,
  listMine: listMyPublicGrammarBooks,
  unpublish: unpublishGrammarBook,
};

export async function handleGrammarSharedByMeGet(
  request: NextRequest,
  deps: MyShareDeps = defaultMyShareDeps,
) {
  try {
    const auth = await deps.requireAuth(request);
    if (!auth.ok) {
      return auth.response;
    }

    const books = await deps.listMine(auth.user.id);
    return NextResponse.json({ success: true, books });
  } catch (error) {
    console.error('[grammar/share] my published books error:', error);
    return NextResponse.json({ success: false, error: '公開中の問題集を取得できませんでした' }, { status: 500 });
  }
}

export async function handleGrammarShareDelete(
  request: NextRequest,
  deps: MyShareDeps = defaultMyShareDeps,
) {
  try {
    const auth = await deps.requireAuth(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsedBookId = bookIdSchema.safeParse(request.nextUrl.searchParams.get('bookId') ?? '');
    if (!parsedBookId.success) {
      return NextResponse.json({ success: false, error: '問題集を指定してください' }, { status: 400 });
    }

    const stopped = await deps.unpublish(auth.user.id, parsedBookId.data);
    if (!stopped) {
      return NextResponse.json({ success: false, error: '指定した問題集にアクセスできません' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[grammar/share] unpublish error:', error);
    return NextResponse.json({ success: false, error: '共有の停止に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleGrammarSharePost(request);
}

export async function GET(request: NextRequest) {
  return handleGrammarSharedByMeGet(request);
}

export async function DELETE(request: NextRequest) {
  return handleGrammarShareDelete(request);
}
