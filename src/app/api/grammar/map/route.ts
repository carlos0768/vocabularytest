import { NextRequest, NextResponse } from 'next/server';
import { requireProUser } from '@/lib/api/pro-auth';
import { buildGrammarMap } from '@/lib/grammar/map';

/**
 * GET /api/grammar/map (Pro限定)
 *
 * 文法マップ: 自分の語法問題を文法事項ツリーに割り当て、ノードごとの習得度を返す。
 * 問題のタグ (grammar_point) は自由入力なので、分類は src/lib/grammar/classify.ts
 * のツリーに寄せる。問題が0問のノードも「まだ手をつけていない領域」として残す。
 *
 * grammar_questions / grammar_question_progress は本人限定RLSのため、
 * Bearer/cookie スコープの client でそのまま読める。
 */

// 集計は全問題を見る必要があるが、際限なく読まないよう上限を置く
const QUESTION_FETCH_LIMIT = 3000;

type GrammarMapDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarMapDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarMapGet(
  request: NextRequest,
  deps: GrammarMapDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const questionsResult = await auth.supabase
      .from('grammar_questions')
      .select('id,grammar_point')
      .eq('user_id', auth.user.id)
      .limit(QUESTION_FETCH_LIMIT);

    if (questionsResult.error) {
      console.error('[grammar/map] questions fetch failed:', questionsResult.error.message);
      return NextResponse.json({ success: false, error: '文法マップの取得に失敗しました' }, { status: 500 });
    }

    // 習得度テーブルは後発のマイグレーション由来。未適用の環境でも
    // マップ自体は出せるよう、失敗しても習得度0として続行する。
    const progressResult = await auth.supabase
      .from('grammar_question_progress')
      .select('question_id,mastered')
      .eq('user_id', auth.user.id)
      .limit(QUESTION_FETCH_LIMIT);

    if (progressResult.error) {
      console.warn('[grammar/map] progress unavailable:', progressResult.error.message);
    }

    const questions = ((questionsResult.data ?? []) as { id: string; grammar_point: string | null }[]).map((row) => ({
      id: row.id,
      grammarPoint: row.grammar_point,
    }));
    const progress = progressResult.error
      ? []
      : ((progressResult.data ?? []) as { question_id: string; mastered: boolean }[]).map((row) => ({
        questionId: row.question_id,
        mastered: Boolean(row.mastered),
      }));

    const map = buildGrammarMap(questions, progress);

    return NextResponse.json({ success: true, ...map });
  } catch (error) {
    console.error('[grammar/map] error:', error);
    return NextResponse.json({ success: false, error: '文法マップの取得に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleGrammarMapGet(request);
}
