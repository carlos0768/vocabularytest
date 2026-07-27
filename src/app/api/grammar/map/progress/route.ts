import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';
import { findPublicQuestion } from '@/lib/grammar/public-bank';

/**
 * POST /api/grammar/map/progress (Pro限定)
 *
 * 文法マップの演習1問の結果を記録する。
 * - 正解: correct_count++、mastered=true
 * - 不正解: wrong_count++、mastered=false
 *
 * 対象は公開問題バンクの問題だけなので、questionId はバンクに実在するものに限る
 * (未知のIDを受け付けると習得度の分母と合わなくなり mastery% が壊れるため)。
 * node_id もクライアント指定ではなくバンクの定義から解決する。
 */

const requestSchema = z.object({
  questionId: z.string().trim().min(1).max(80),
  result: z.enum(['correct', 'wrong']),
}).strict();

type GrammarMapProgressDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarMapProgressDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarMapProgressPost(
  request: NextRequest,
  deps: GrammarMapProgressDeps = defaultDeps,
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

    const { questionId, result } = parsed.data;

    // 集計の真実の source は公開バンクの定義
    const question = findPublicQuestion(questionId);
    if (!question) {
      return NextResponse.json({ success: false, error: '指定した問題が見つかりません' }, { status: 404 });
    }

    const correct = result === 'correct';
    const supabase = auth.supabase;

    const { data: existing, error: existingError } = await supabase
      .from('grammar_map_progress')
      .select('correct_count,wrong_count')
      .eq('user_id', auth.user.id)
      .eq('question_id', questionId)
      .maybeSingle();

    if (existingError) {
      console.error('[grammar/map/progress] lookup failed:', existingError.message);
      return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
    }

    const { error: upsertError } = await supabase
      .from('grammar_map_progress')
      .upsert({
        user_id: auth.user.id,
        question_id: questionId,
        node_id: question.nodeId,
        correct_count: (existing?.correct_count ?? 0) + (correct ? 1 : 0),
        wrong_count: (existing?.wrong_count ?? 0) + (correct ? 0 : 1),
        mastered: correct,
        last_answered_at: new Date().toISOString(),
      }, { onConflict: 'user_id,question_id' });

    if (upsertError) {
      console.error('[grammar/map/progress] upsert failed:', upsertError.message);
      return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true, mastered: correct });
  } catch (error) {
    console.error('[grammar/map/progress] error:', error);
    return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleGrammarMapProgressPost(request);
}
