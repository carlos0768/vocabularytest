import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { isUserActivePro } from '@/app/api/shared-projects/pro';
import { getReelBookForImport, parseReelBookKey } from '../../../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ bookKey: string }> };

export type ReelBookWordsRouteDeps = {
  requireAuthenticatedUser: typeof requireAuthenticatedUser;
  isUserActivePro: typeof isUserActivePro;
  getReelBookForImport: typeof getReelBookForImport;
};

function getDeps(deps?: Partial<ReelBookWordsRouteDeps>): ReelBookWordsRouteDeps {
  return {
    requireAuthenticatedUser: deps?.requireAuthenticatedUser ?? requireAuthenticatedUser,
    isUserActivePro: deps?.isUserActivePro ?? isUserActivePro,
    getReelBookForImport: deps?.getReelBookForImport ?? getReelBookForImport,
  };
}

// Full word list of a reel book, used by the "+" one-tap import.
// Pro-only: mirrors the shared-wordbook import policy.
export async function handleReelBookWordsGet(
  request: NextRequest,
  bookKey: string,
  deps?: Partial<ReelBookWordsRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    const decodedKey = decodeURIComponent(bookKey);
    if (!parseReelBookKey(decodedKey)) {
      return NextResponse.json(
        { success: false, error: '単語帳の指定が不正です。' },
        { status: 400 },
      );
    }

    const auth = await resolved.requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const isPro = await resolved.isUserActivePro(auth.user.id);
    if (!isPro) {
      return NextResponse.json(
        { success: false, error: '単語帳のインポートはProプラン限定です。', requiresPro: true },
        { status: 403 },
      );
    }

    const payload = await resolved.getReelBookForImport(decodedKey);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: '単語帳が見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: true, ...payload },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('reel book words error:', error);
    return NextResponse.json(
      { success: false, error: '単語帳の取得に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { bookKey } = await params;
  return handleReelBookWordsGet(request, bookKey);
}
