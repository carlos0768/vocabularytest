import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * POST /api/grammar/progress (Pro限定)
 *
 * 語法演習の1問の結果(正解/不正解)を記録して習得度を更新する。
 * - 正解: correct_count++、mastered=true
 * - 不正解: wrong_count++、mastered=false、さらに grammar_question_misses にも
 *   1行記録する(ChatGPTの「間違えた問題」復習用)。
 * grammar_question_progress / grammar_question_misses は本人限定RLSのため
 * Bearer/cookie スコープの client でそのまま upsert/insert できる。
 */

const requestSchema = z.object({
  questionId: z.string().uuid(),
  bookId: z.string().uuid(),
  result: z.enum(['correct', 'wrong']),
}).strict();

type GrammarProgressDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarProgressDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarProgressPost(
  request: NextRequest,
  deps: GrammarProgressDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, requestSchema, {
      invalidMessage: '無効な記録データです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { questionId, bookId, result } = parsed.data;
    const supabase = auth.supabase;

    // 自分の問題に対してのみ記録できる。book_id は問題行から取得し、
    // クライアント指定の bookId が実際の所属と一致するか検証する
    // (不一致だと習得度の集計が壊れ mastery% > 100% になり得るため)。
    const { data: question, error: questionError } = await supabase
      .from('grammar_questions')
      .select('id,book_id')
      .eq('id', questionId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (questionError) {
      console.error('[grammar/progress] question lookup failed:', questionError.message);
      return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
    }
    if (!question || question.book_id !== bookId) {
      return NextResponse.json({ success: false, error: '指定した問題にアクセスできません' }, { status: 403 });
    }

    // 集計の真実の source は問題行の book_id
    const resolvedBookId = question.book_id as string;
    const correct = result === 'correct';

    // 既存の進捗を取得してカウントを積み増す(UNIQUE(user_id, question_id) で1行)
    const { data: existing, error: existingError } = await supabase
      .from('grammar_question_progress')
      .select('id,correct_count,wrong_count')
      .eq('user_id', auth.user.id)
      .eq('question_id', questionId)
      .maybeSingle();

    if (existingError) {
      console.error('[grammar/progress] progress lookup failed:', existingError.message);
      return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
    }

    const correctCount = (existing?.correct_count ?? 0) + (correct ? 1 : 0);
    const wrongCount = (existing?.wrong_count ?? 0) + (correct ? 0 : 1);
    const nowIso = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from('grammar_question_progress')
      .upsert({
        user_id: auth.user.id,
        question_id: questionId,
        book_id: resolvedBookId,
        correct_count: correctCount,
        wrong_count: wrongCount,
        mastered: correct,
        last_answered_at: nowIso,
      }, { onConflict: 'user_id,question_id' });

    if (upsertError) {
      console.error('[grammar/progress] upsert failed:', upsertError.message);
      return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
    }

    // 不正解は ChatGPT の復習用に誤答ログも残す
    if (!correct) {
      const { error: missError } = await supabase
        .from('grammar_question_misses')
        .insert({ user_id: auth.user.id, question_id: questionId, book_id: resolvedBookId });
      if (missError) {
        // 誤答ログは best-effort。習得度の記録は成功しているので握りつぶす。
        console.error('[grammar/progress] miss insert failed (non-critical):', missError.message);
      }
    }

    return NextResponse.json({ success: true, mastered: correct });
  } catch (error) {
    console.error('[grammar/progress] error:', error);
    return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleGrammarProgressPost(request);
}
