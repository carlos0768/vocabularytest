import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { setReelWordLike } from '../shared';

export const dynamic = 'force-dynamic';

const likeSchema = z
  .object({
    source: z.enum(['shared', 'official']),
    wordId: z.string().uuid(),
    liked: z.boolean(),
  })
  .strict();

export type ReelLikeRouteDeps = {
  requireAuthenticatedUser: typeof requireAuthenticatedUser;
  setReelWordLike: typeof setReelWordLike;
};

function getDeps(deps?: Partial<ReelLikeRouteDeps>): ReelLikeRouteDeps {
  return {
    requireAuthenticatedUser: deps?.requireAuthenticatedUser ?? requireAuthenticatedUser,
    setReelWordLike: deps?.setReelWordLike ?? setReelWordLike,
  };
}

export async function handleReelLikePost(
  request: NextRequest,
  deps?: Partial<ReelLikeRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    const auth = await resolved.requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, likeSchema, {
      invalidMessage: 'リクエストが不正です。',
    });
    if (!parsed.ok) return parsed.response;

    const state = await resolved.setReelWordLike({
      userId: auth.user.id,
      source: parsed.data.source,
      wordId: parsed.data.wordId,
      liked: parsed.data.liked,
    });
    if (!state) {
      return NextResponse.json(
        { success: false, error: '対象の単語が見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    console.error('reel like error:', error);
    return NextResponse.json(
      { success: false, error: 'いいねの更新に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleReelLikePost(request);
}
