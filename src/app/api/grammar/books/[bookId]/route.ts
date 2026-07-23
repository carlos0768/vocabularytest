import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * DELETE /api/grammar/books/[bookId] (Pro限定)
 *
 * 自分の語法問題集を削除する。grammar_questions / grammar_question_misses は
 * FK の ON DELETE CASCADE で一緒に消える。本人限定RLSの範囲内なので
 * Bearer/cookie スコープの client で完結する (service-role 不要)。
 */

const paramsSchema = z.object({
  bookId: z.string().uuid(),
});

type GrammarBookDeleteContext = {
  params: Promise<{ bookId: string }>;
};

type GrammarBookDeleteDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarBookDeleteDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarBookDelete(
  request: NextRequest,
  context: GrammarBookDeleteContext,
  deps: GrammarBookDeleteDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: '問題集を指定してください' }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from('grammar_books')
      .delete()
      .eq('id', parsed.data.bookId)
      .eq('user_id', auth.user.id)
      .select('id');

    if (error) {
      console.error('[grammar/books] delete failed:', error.message);
      return NextResponse.json({ success: false, error: '問題集の削除に失敗しました' }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: '指定した問題集にアクセスできません' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[grammar/books] error:', error);
    return NextResponse.json({ success: false, error: '問題集の削除に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: GrammarBookDeleteContext) {
  return handleGrammarBookDelete(request, context);
}
