import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { recordQuizSessionAnswer } from '@/lib/friends/server';
import { recordQuizWordMiss } from '@/lib/quiz-misses/server';
import { parseJsonWithSchema } from '@/lib/api/validation';

const quizSessionEventSchema = z.object({
  wordId: z.string().trim().min(1).max(120),
  projectId: z.string().trim().min(1).max(120).optional().nullable(),
  english: z.string().trim().min(1).max(200),
  japanese: z.string().trim().min(1).max(300),
  becameMastered: z.boolean(),
  isCorrect: z.boolean().optional(),
}).strict();

type QuizSessionEventPostDeps = {
  requireAuthenticatedUser?: typeof requireAuthenticatedUser;
  recordQuizSessionAnswer?: typeof recordQuizSessionAnswer;
  recordQuizWordMiss?: typeof recordQuizWordMiss;
};

export async function handleQuizSessionEventPost(
  request: NextRequest,
  deps: QuizSessionEventPostDeps = {},
) {
  const requireAuthenticated = deps.requireAuthenticatedUser ?? requireAuthenticatedUser;
  const recordAnswer = deps.recordQuizSessionAnswer ?? recordQuizSessionAnswer;
  const recordMiss = deps.recordQuizWordMiss ?? recordQuizWordMiss;

  try {
    const auth = await requireAuthenticated(request);
    if (!auth.ok) return auth.response;

    const parsed = await parseJsonWithSchema(request, quizSessionEventSchema, {
      invalidMessage: '学習セッションの記録データが不正です。',
    });
    if (!parsed.ok) return parsed.response;

    const result = await recordAnswer(auth.user.id, parsed.data);

    // Log wrong answers (best effort) to power group "most-missed words".
    if (parsed.data.isCorrect === false) {
      try {
        await recordMiss(auth.user.id, {
          wordId: parsed.data.wordId,
          projectId: parsed.data.projectId,
          english: parsed.data.english,
          japanese: parsed.data.japanese,
        });
      } catch (missError) {
        console.warn('Failed to record quiz word miss:', missError);
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('quiz session event POST error:', error);
    return NextResponse.json({ success: false, error: '学習セッションの記録に失敗しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleQuizSessionEventPost(request);
}
