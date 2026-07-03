import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { setReelWordFeedback } from '../shared';

export const dynamic = 'force-dynamic';

const feedbackSchema = z
  .object({
    source: z.enum(['shared', 'official']),
    wordId: z.string().uuid(),
    feedback: z.enum(['interested', 'not_interested']),
  })
  .strict();

export type ReelFeedbackRouteDeps = {
  requireAuthenticatedUser: typeof requireAuthenticatedUser;
  setReelWordFeedback: typeof setReelWordFeedback;
};

function getDeps(deps?: Partial<ReelFeedbackRouteDeps>): ReelFeedbackRouteDeps {
  return {
    requireAuthenticatedUser: deps?.requireAuthenticatedUser ?? requireAuthenticatedUser,
    setReelWordFeedback: deps?.setReelWordFeedback ?? setReelWordFeedback,
  };
}

export async function handleReelFeedbackPost(
  request: NextRequest,
  deps?: Partial<ReelFeedbackRouteDeps>,
) {
  const resolved = getDeps(deps);
  try {
    const auth = await resolved.requireAuthenticatedUser(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, feedbackSchema, {
      invalidMessage: 'リクエストが不正です。',
    });
    if (!parsed.ok) return parsed.response;

    const state = await resolved.setReelWordFeedback({
      userId: auth.user.id,
      source: parsed.data.source,
      wordId: parsed.data.wordId,
      feedback: parsed.data.feedback,
    });
    if (!state) {
      return NextResponse.json(
        { success: false, error: '対象の単語が見つかりません。' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    console.error('reel feedback error:', error);
    return NextResponse.json(
      { success: false, error: 'フィードバックの送信に失敗しました。' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleReelFeedbackPost(request);
}
