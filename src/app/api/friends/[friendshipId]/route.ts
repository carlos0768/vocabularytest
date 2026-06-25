import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { FriendRequestError, deleteFriendship } from '@/lib/friends/server';

type FriendDeleteContext = {
  params: Promise<{ friendshipId: string }>;
};

type FriendDeleteDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  deleteFriendship?: typeof deleteFriendship;
};

function friendDeleteErrorResponse(error: FriendRequestError): NextResponse {
  if (error.code === 'not_found') {
    return NextResponse.json({ success: false, error: 'フレンドが見つかりません。' }, { status: 404 });
  }
  if (error.code === 'not_authorized') {
    return NextResponse.json({ success: false, error: 'このフレンドは操作できません。' }, { status: 403 });
  }
  return NextResponse.json({ success: false, error: 'フレンド解除に失敗しました。' }, { status: 500 });
}

export async function handleFriendDelete(
  request: NextRequest,
  context: FriendDeleteContext,
  deps: FriendDeleteDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const removeFriendship = deps.deleteFriendship ?? deleteFriendship;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const { friendshipId } = await context.params;
    await removeFriendship(auth.user.id, friendshipId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FriendRequestError) return friendDeleteErrorResponse(error);
    console.error('friend DELETE error:', error);
    return NextResponse.json({ success: false, error: 'フレンド解除に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: FriendDeleteContext) {
  return handleFriendDelete(request, context);
}
