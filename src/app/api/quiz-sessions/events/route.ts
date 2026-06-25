import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { recordQuizSessionAnswer } from '@/lib/friends/server';
import { parseJsonWithSchema } from '@/lib/api/validation';

const quizSessionEventSchema = z.object({
  wordId: z.string().trim().min(1).max(120),
  projectId: z.string().trim().min(1).max(120).optional().nullable(),
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
  becameMastered: z.boolean(),
}).strict();

type QuizSessionEventPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  recordQuizSessionAnswer?: typeof recordQuizSessionAnswer;
};

export async function handleQuizSessionEventPost(
  request: NextRequest,
  deps: QuizSessionEventPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const recordAnswer = deps.recordQuizSessionAnswer ?? recordQuizSessionAnswer;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, quizSessionEventSchema, {
      invalidMessage: '学習セッションの記録データが不正です。',
    });
    if (!parsed.ok) return parsed.response;

    const result = await recordAnswer(auth.user.id, parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('quiz session event POST error:', error);
    return NextResponse.json({ success: false, error: '学習セッションの記録に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleQuizSessionEventPost(request);
}
