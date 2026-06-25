import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { FriendRequestError, createFriendRequest } from '@/lib/friends/server';
import { parseJsonWithSchema } from '@/lib/api/validation';

const friendRequestSchema = z.object({
  accountId: z.string().trim().min(1).max(80),
}).strict();

type FriendRequestPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  createFriendRequest?: typeof createFriendRequest;
};

function friendRequestErrorResponse(error: FriendRequestError): NextResponse {
  if (error.code === 'invalid_account_id') {
    return NextResponse.json({ success: false, error: 'アカウントIDを確認してください。' }, { status: 400 });
  }
  if (error.code === 'target_not_found') {
    return NextResponse.json({ success: false, error: 'ユーザーが見つかりません。' }, { status: 404 });
  }
  if (error.code === 'self_request') {
    return NextResponse.json({ success: false, error: '自分自身は追加できません。' }, { status: 400 });
  }
  return NextResponse.json({ success: false, error: 'フレンド申請に失敗しました。' }, { status: 500 });
}

export async function handleFriendRequestPost(
  request: NextRequest,
  deps: FriendRequestPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const requestFriend = deps.createFriendRequest ?? createFriendRequest;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, friendRequestSchema, {
      invalidMessage: 'アカウントIDを確認してください。',
    });
    if (!parsed.ok) return parsed.response;

    const friendship = await requestFriend(auth.user.id, parsed.data.accountId);
    return NextResponse.json({ success: true, friendship });
  } catch (error) {
    if (error instanceof FriendRequestError) return friendRequestErrorResponse(error);
    console.error('friend request POST error:', error);
    return NextResponse.json({ success: false, error: 'フレンド申請に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleFriendRequestPost(request);
}
