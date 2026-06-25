import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listFollowsHome, followUser, unfollowUser, FollowError } from '@/lib/follows/server';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const payload = await listFollowsHome(auth.user.id);
    return NextResponse.json({ success: true, ...payload });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'follows_fetch_failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { accountId?: string } | null;
  const accountId = body?.accountId?.trim();
  if (!accountId) {
    return NextResponse.json({ success: false, error: 'missing_account_id' }, { status: 400 });
  }

  try {
    const follow = await followUser(auth.user.id, accountId);
    return NextResponse.json({ success: true, follow });
  } catch (e) {
    if (e instanceof FollowError) {
      return NextResponse.json({ success: false, error: e.code }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'follow_failed' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as { followId?: string } | null;
  const followId = body?.followId?.trim();
  if (!followId) {
    return NextResponse.json({ success: false, error: 'missing_follow_id' }, { status: 400 });
  }

  try {
    await unfollowUser(auth.user.id, followId);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof FollowError) {
      return NextResponse.json({ success: false, error: e.code }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'unfollow_failed' },
      { status: 500 },
    );
  }
}
