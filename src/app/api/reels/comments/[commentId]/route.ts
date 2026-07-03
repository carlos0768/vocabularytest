import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { deleteReelWordComment } from '../../shared';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ commentId: string }> };

export type ReelCommentDeleteRouteDeps = {
  requireAuthenticatedUser: typeof requireAuthenticatedUser;
  deleteReelWordComment: typeof deleteReelWordComment;
};

function getDeps(deps?: Partial<ReelCommentDeleteRouteDeps>): ReelCommentDeleteRouteDeps {
  return {
    requireAuthenticatedUser: deps?.requireAuthenticatedUser ?? requireAuthenticatedUser,
    deleteReelWordComment: deps?.deleteReelWordComment ?? deleteReelWordComment,
  };
}

export async function handleReelCommentDelete(
  request: NextRequest,
  commentId: string,
  deps?: Partial<ReelCommentDeleteRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    if (!/^[0-9a-f-]{36}$/i.test(commentId)) {
      return NextResponse.json(
        { success: false, error: 'コメントの指定が不正です。' },
        { status: 400 },
      );
    }

    const auth = await resolved.requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const deleted = await resolved.deleteReelWordComment({
      userId: auth.user.id,
      commentId,
    });
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'コメントが見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('reel comment delete error:', error);
    return NextResponse.json(
      { success: false, error: 'コメントの削除に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { commentId } = await params;
  return handleReelCommentDelete(request, commentId);
}
