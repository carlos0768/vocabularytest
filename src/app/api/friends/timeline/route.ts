import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listFriendTimeline } from '@/lib/friends/server';

type FriendTimelineGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listFriendTimeline?: typeof listFriendTimeline;
};

export async function handleFriendTimelineGet(
  request: NextRequest,
  deps: FriendTimelineGetDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const listTimeline = deps.listFriendTimeline ?? listFriendTimeline;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const limit = Number(request.nextUrl.searchParams.get('limit') ?? '');
    const sessions = await listTimeline(auth.user.id, undefined, Number.isFinite(limit) ? limit : undefined);
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    console.error('friend timeline GET error:', error);
    return NextResponse.json({ success: false, error: 'タイムラインの取得に失敗しました。' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleFriendTimelineGet(request);
}
