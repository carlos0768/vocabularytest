import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * DELETE /api/grammar/questions/[questionId] (Pro限定)
 *
 * 問題集ごとではなく、問題を1問だけ消す。grammar_question_misses は FK の
 * ON DELETE CASCADE で一緒に消える。本人限定RLS（grammar_questions_own）の
 * 範囲内なので Bearer/cookie スコープの client で完結する (service-role 不要)。
 */

const paramsSchema = z.object({
  questionId: z.string().uuid(),
});

type GrammarQuestionDeleteContext = {
  params: Promise<{ questionId: string }>;
};

type GrammarQuestionDeleteDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarQuestionDeleteDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarQuestionDelete(
  request: NextRequest,
  context: GrammarQuestionDeleteContext,
  deps: GrammarQuestionDeleteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: '問題を指定してください' }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from('grammar_questions')
      .delete()
      .eq('id', parsed.data.questionId)
      .eq('user_id', auth.user.id)
      .select('id');

    if (error) {
      console.error('[grammar/questions] delete failed:', error.message);
      return NextResponse.json({ success: false, error: '問題の削除に失敗しました' }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: '指定した問題にアクセスできません' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[grammar/questions] error:', error);
    return NextResponse.json({ success: false, error: '問題の削除に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: GrammarQuestionDeleteContext) {
  return handleGrammarQuestionDelete(request, context);
}
