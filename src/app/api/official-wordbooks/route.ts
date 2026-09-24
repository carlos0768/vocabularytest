import { NextRequest, NextResponse } from 'next/server';
import { listPublicOfficialWordbooks } from '@/lib/official-wordbooks/catalog';

/**
 * GET /api/official-wordbooks — 公開中の公式単語帳の一覧。
 *
 * 共有ページ (/shared の「公式」タブ) の一覧に使う。返すのはタイトル・英検
 * レベル・単語数だけなのでログイン不要 (語法問題集の公開一覧と同じ)。
 * 単語の中身を見る・取り込むには /official/[slug] でログインが必要。
 */

export const dynamic = 'force-dynamic';

type OfficialWordbooksGetDeps = {
  listPublicOfficialWordbooks: typeof listPublicOfficialWordbooks;
};

const defaultDeps: OfficialWordbooksGetDeps = {
  listPublicOfficialWordbooks,
};

export async function handleOfficialWordbooksGet(
  request: NextRequest,
  deps: OfficialWordbooksGetDeps = defaultDeps,
) {
  try {
    const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? '');
    const result = await deps.listPublicOfficialWordbooks({
      limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
      cursor: request.nextUrl.searchParams.get('cursor'),
      query: request.nextUrl.searchParams.get('q'),
    });

    return NextResponse.json(
      { success: true, items: result.items, nextCursor: result.nextCursor },
      // ユーザー固有の情報を含まないので短時間キャッシュしてよい。
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[official-wordbooks] list error:', error);
    return NextResponse.json(
      { success: false, error: '公式単語帳の一覧を取得できませんでした。' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleOfficialWordbooksGet(request);
}
