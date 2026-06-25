import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { FriendRequestError, respondToFriendRequest } from '@/lib/friends/server';
import { parseJsonWithSchema } from '@/lib/api/validation';

const friendResponseSchema = z.object({
  friendshipId: z.string().uuid(),
  action: z.enum(['accept', 'decline']),
}).strict();

type FriendRespondPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  respondToFriendRequest?: typeof respondToFriendRequest;
};

function friendRespondErrorResponse(error: FriendRequestError): NextResponse {
  if (error.code === 'not_found') {
    return NextResponse.json({ success: false, error: '申請が見つかりません。' }, { status: 404 });
  }
  if (error.code === 'not_authorized') {
    return NextResponse.json({ success: false, error: 'この申請は操作できません。' }, { status: 403 });
  }
  return NextResponse.json({ success: false, error: 'フレンド申請の更新に失敗しました。' }, { status: 500 });
}

export async function handleFriendRespondPost(
  request: NextRequest,
  deps: FriendRespondPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const respond = deps.respondToFriendRequest ?? respondToFriendRequest;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, friendResponseSchema, {
      invalidMessage: '申請データを確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const friendship = await respond(auth.user.id, parsed.data.friendshipId, parsed.data.action);
    return NextResponse.json({ success: true, friendship });
  } catch (error) {
    if (error instanceof FriendRequestError) return friendRespondErrorResponse(error);
    console.error('friend respond POST error:', error);
    return NextResponse.json({ success: false, error: 'フレンド申請の更新に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleFriendRespondPost(request);
}
