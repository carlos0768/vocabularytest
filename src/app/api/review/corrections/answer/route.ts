import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { answerCorrectionReviewItemForUser } from '@/lib/learning-assets/service';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';

const requestSchema = z.object({
  reviewItemId: z.string().uuid(),
  isCorrect: z.boolean(),
}).strict();

type ReviewCorrectionsAnswerDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  answerReview?: typeof answerCorrectionReviewItemForUser;
};

export async function handleReviewCorrectionsAnswerPost(
  request: NextRequest,
  deps: ReviewCorrectionsAnswerDeps = {},
) {
  const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
  const answerReview = deps.answerReview ?? answerCorrectionReviewItemForUser;

  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '復習回答が不正です。',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const reviewItem = await answerReview(user.id, parsed.data.reviewItemId, parsed.data.isCorrect);
    return NextResponse.json({ success: true, reviewItem });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':', 1)[0] : '';
    const status = code === 'review_item_not_found' ? 404 : 500;
    const message = code === 'review_item_not_found'
      ? '復習項目が見つかりません。'
      : '復習回答の保存に失敗しました。';
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  return handleReviewCorrectionsAnswerPost(request);
}
