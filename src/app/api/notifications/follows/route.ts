import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listFollowNotifications, markFollowNotificationsRead } from '@/lib/follows/server';

type FollowNotificationsGetDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  listFollowNotifications?: typeof listFollowNotifications;
  markFollowNotificationsRead?: typeof markFollowNotificationsRead;
};

export async function handleFollowNotificationsGet(
  request: NextRequest,
  deps: FollowNotificationsGetDeps = {},
) {
  const auth = await (deps.requireAuthenticatedUser ?? requireAuthenticatedUser)(request);
  if (!auth.ok) return auth.response;

  try {
    const notifications = await (deps.listFollowNotifications ?? listFollowNotifications)(auth.user.id);
    return NextResponse.json({ success: true, notifications });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'follow_notifications_failed' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleFollowNotificationsGet(request);
}

export async function handleFollowNotificationsRead(
  request: NextRequest,
  deps: FollowNotificationsGetDeps = {},
) {
  const auth = await (deps.requireAuthenticatedUser ?? requireAuthenticatedUser)(request);
  if (!auth.ok) return auth.response;

  try {
    await (deps.markFollowNotificationsRead ?? markFollowNotificationsRead)(auth.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'follow_notifications_read_failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleFollowNotificationsRead(request);
}
