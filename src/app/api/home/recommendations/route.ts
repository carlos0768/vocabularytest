import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import {
  HOME_BOOKS_DEFAULT_LIMIT,
  HOME_BOOKS_MAX_LIMIT,
  HOME_REELS_DEFAULT_LIMIT,
  HOME_REELS_MAX_LIMIT,
  buildHomeRecommendations,
  clampHomeLimit,
} from './shared';

export const dynamic = 'force-dynamic';

/**
 * ホーム画面のおすすめ（英検級ベースの共有単語帳 + 語源あり単語限定の
 * リールプレビュー）。/api/reels/feed と違い、無料枠のカウントや既読の
 * 記録は一切しない読み取り専用プレビュー。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const booksLimit = clampHomeLimit(
      request.nextUrl.searchParams.get('books'),
      HOME_BOOKS_DEFAULT_LIMIT,
      HOME_BOOKS_MAX_LIMIT,
    );
    const reelsLimit = clampHomeLimit(
      request.nextUrl.searchParams.get('reels'),
      HOME_REELS_DEFAULT_LIMIT,
      HOME_REELS_MAX_LIMIT,
    );

    const payload = await buildHomeRecommendations({
      userId: auth.user.id,
      booksLimit,
      reelsLimit,
    });

    return NextResponse.json(
      { success: true, ...payload },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('home recommendations error:', error);
    return NextResponse.json(
      { success: false, error: 'おすすめの取得に失敗しました。' },
      { status: 500 },
    );
  }
}
