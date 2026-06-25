import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listFriendsHome } from '@/lib/friends/server';

type FriendsGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listFriendsHome?: typeof listFriendsHome;
};

export async function handleFriendsGet(
  request: NextRequest,
  deps: FriendsGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const listFriends = deps.listFriendsHome ?? listFriendsHome;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const payload = await listFriends(auth.user.id);
    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('friends GET error:', error);
    return NextResponse.json({ success: false, error: 'フレンド情報の取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleFriendsGet(request);
}
