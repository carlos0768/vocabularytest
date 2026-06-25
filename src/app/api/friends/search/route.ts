import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { searchFriendProfiles } from '@/lib/friends/server';

type FriendSearchGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  searchFriendProfiles?: typeof searchFriendProfiles;
};

export async function handleFriendSearchGet(
  request: NextRequest,
  deps: FriendSearchGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const searchProfiles = deps.searchFriendProfiles ?? searchFriendProfiles;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const query = request.nextUrl.searchParams.get('q') ?? '';
    const results = await searchProfiles(auth.user.id, query);
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('friend search GET error:', error);
    return NextResponse.json({ success: false, error: 'ユーザー検索に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleFriendSearchGet(request);
}
