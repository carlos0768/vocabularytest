import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { createReelWordComment, listReelWordComments } from '../shared';

export const dynamic = 'force-dynamic';

const createSchema = z
  .object({
    source: z.enum(['shared', 'official']),
    wordId: z.string().uuid(),
    body: z.string().trim().min(1).max(500),
  })
  .strict();

export type ReelCommentsRouteDeps = {
  requireAuthenticatedUser: typeof requireAuthenticatedUser;
  listReelWordComments: typeof listReelWordComments;
  createReelWordComment: typeof createReelWordComment;
};

function getDeps(deps?: Partial<ReelCommentsRouteDeps>): ReelCommentsRouteDeps {
  return {
    requireAuthenticatedUser: deps?.requireAuthenticatedUser ?? requireAuthenticatedUser,
    listReelWordComments: deps?.listReelWordComments ?? listReelWordComments,
    createReelWordComment: deps?.createReelWordComment ?? createReelWordComment,
  };
}

export async function handleReelCommentsGet(
  request: NextRequest,
  deps?: Partial<ReelCommentsRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    const auth = await resolved.requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const source = request.nextUrl.searchParams.get('source');
    const wordId = request.nextUrl.searchParams.get('wordId');
    if ((source !== 'shared' && source !== 'official') || !wordId) {
      return NextResponse.json(
        { success: false, error: 'リクエストが不正です。' },
        { status: 400 },
      );
    }

    const comments = await resolved.listReelWordComments({
      viewerId: auth.user.id,
      source,
      wordId,
    });
    if (!comments) {
      return NextResponse.json(
        { success: false, error: '対象の単語が見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: true, comments },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('reel comments list error:', error);
    return NextResponse.json(
      { success: false, error: 'コメントの取得に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function handleReelCommentsPost(
  request: NextRequest,
  deps?: Partial<ReelCommentsRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    const auth = await resolved.requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, createSchema, {
      invalidMessage: 'リクエストが不正です。',
    });
    if (!parsed.ok) return parsed.response;

    const comment = await resolved.createReelWordComment({
      userId: auth.user.id,
      source: parsed.data.source,
      wordId: parsed.data.wordId,
      body: parsed.data.body,
    });
    if (!comment) {
      return NextResponse.json(
        { success: false, error: '対象の単語が見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, comment });
  } catch (error) {
    console.error('reel comment create error:', error);
    return NextResponse.json(
      { success: false, error: 'コメントの投稿に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleReelCommentsGet(request);
}

export async function POST(request: NextRequest) {
  return handleReelCommentsPost(request);
}
