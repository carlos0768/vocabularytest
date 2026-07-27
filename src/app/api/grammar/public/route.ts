import { NextRequest, NextResponse } from 'next/server';
import { listPublicGrammarBooks } from '../shared-grammar-books';

/**
 * GET /api/grammar/public — 共有ページに公開されている語法問題集の一覧。
 *
 * 共有単語帳の discover と同じく、一覧はログイン不要 (返すのはタイトル・
 * 問題数・投稿者だけ)。問題の中身を見る・取り込むには
 * /grammar/share/[shareId] でログインが必要。
 */

export const dynamic = 'force-dynamic';

type PublicGrammarBooksDeps = {
  listPublicBooks: typeof listPublicGrammarBooks;
};

const defaultDeps: PublicGrammarBooksDeps = {
  listPublicBooks: listPublicGrammarBooks,
};

export async function handleGrammarPublicGet(
  request: NextRequest,
  deps: PublicGrammarBooksDeps = defaultDeps,
) {
  try {
    const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? '');
    const result = await deps.listPublicBooks({
      limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
      cursor: request.nextUrl.searchParams.get('cursor'),
      query: request.nextUrl.searchParams.get('q'),
    });

    return NextResponse.json(
      { success: true, items: result.items, nextCursor: result.nextCursor },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[grammar/public] list error:', error);
    return NextResponse.json({ success: false, error: '公開されている語法問題集を取得できませんでした' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleGrammarPublicGet(request);
}
