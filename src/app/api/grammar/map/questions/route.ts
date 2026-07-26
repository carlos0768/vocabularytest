import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireProUser } from '@/lib/api/pro-auth';
import { filterQuestionsByGrammarNode } from '@/lib/grammar/map';
import {
  GRAMMAR_UNCATEGORIZED_ID,
  GRAMMAR_UNCATEGORIZED_LABEL,
  findGrammarNode,
} from '@/lib/grammar/taxonomy';

/**
 * GET /api/grammar/map/questions?nodeId=... (Pro限定)
 *
 * 文法マップのノード (カテゴリなら配下すべて) に属する問題を、問題集をまたいで返す。
 * 「仮定法だけ集中的に演習する」ための出題エンドポイント。
 *
 * 分類は自由入力タグからの推定なので、問題の所属は grammar_questions を
 * 全件読んでから src/lib/grammar/classify.ts で絞り込む (DB側にタグの正規化列は持たない)。
 * 習得度の記録に使うので、復習モードと同様に所属問題集ID (bookId) も返す。
 */

const querySchema = z.object({
  // ツリーのIDはスラッグ (英小文字+ハイフン) のみ
  nodeId: z.string().trim().min(1).max(60).regex(/^[a-z][a-z0-9-]*$/),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
}).strict();

// 分類のために全問題を読むが、際限なく読まないよう上限を置く
const QUESTION_FETCH_LIMIT = 3000;

type GrammarQuestionRow = {
  id: string;
  book_id: string;
  sentence: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  grammar_point: string | null;
  sentence_ja: string | null;
  show_translation: boolean;
};

type GrammarMapQuestionsDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: GrammarMapQuestionsDeps = {
  requirePro: requireProUser,
};

export async function handleGrammarMapQuestionsGet(
  request: NextRequest,
  deps: GrammarMapQuestionsDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'パラメータが不正です' }, { status: 400 });
    }

    const { nodeId, limit } = parsed.data;
    const node = findGrammarNode(nodeId);
    const nodeLabel = nodeId === GRAMMAR_UNCATEGORIZED_ID ? GRAMMAR_UNCATEGORIZED_LABEL : node?.label;
    if (!nodeLabel) {
      return NextResponse.json({ success: false, error: '指定した文法項目が見つかりません' }, { status: 404 });
    }

    const { data, error } = await auth.supabase
      .from('grammar_questions')
      .select('id,book_id,sentence,choices,correct_index,explanation,grammar_point,sentence_ja,show_translation')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(QUESTION_FETCH_LIMIT);

    if (error) {
      console.error('[grammar/map/questions] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: '問題の取得に失敗しました' }, { status: 500 });
    }

    const rows = (data ?? []) as GrammarQuestionRow[];
    const matched = filterQuestionsByGrammarNode(
      rows.map((row) => ({ row, grammarPoint: row.grammar_point })),
      nodeId,
    ).map((entry) => entry.row);

    const ordered = await orderByProgress(auth.supabase, auth.user.id, matched);

    return NextResponse.json({
      success: true,
      nodeId,
      nodeLabel,
      totalMatched: matched.length,
      questions: ordered.slice(0, limit).map((row) => ({
        id: row.id,
        bookId: row.book_id,
        sentence: row.sentence,
        choices: row.choices,
        correctIndex: row.correct_index,
        explanation: row.explanation,
        grammarPoint: row.grammar_point,
        sentenceJa: row.sentence_ja,
        showTranslation: row.show_translation,
      })),
    });
  } catch (error) {
    console.error('[grammar/map/questions] error:', error);
    return NextResponse.json({ success: false, error: '問題の取得に失敗しました' }, { status: 500 });
  }
}

/**
 * 未回答 → 苦手 → 習得済み の順に並べ替える (問題集単位の演習と同じ考え方)。
 * 習得度が読めない環境では元の作成順のまま返す。
 */
async function orderByProgress<T extends { id: string }>(
  supabase: SupabaseClient,
  userId: string,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;

  const progressResult = await supabase
    .from('grammar_question_progress')
    .select('question_id,mastered,last_answered_at')
    .eq('user_id', userId);

  if (progressResult.error) {
    console.warn('[grammar/map/questions] progress order unavailable:', progressResult.error.message);
    return rows;
  }

  const progressRows = (progressResult.data ?? []) as {
    question_id: string;
    mastered: boolean;
    last_answered_at: string | null;
  }[];

  const progressByQuestion = new Map<string, { mastered: boolean; lastAnsweredAt: number }>();
  for (const p of progressRows) {
    progressByQuestion.set(p.question_id, {
      mastered: Boolean(p.mastered),
      lastAnsweredAt: p.last_answered_at ? Date.parse(p.last_answered_at) || 0 : 0,
    });
  }

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const pa = progressByQuestion.get(a.row.id);
      const pb = progressByQuestion.get(b.row.id);
      const masteredA = pa?.mastered ? 1 : 0;
      const masteredB = pb?.mastered ? 1 : 0;
      if (masteredA !== masteredB) return masteredA - masteredB; // 習得済みは後ろへ
      const lastA = pa ? pa.lastAnsweredAt : 0; // 未回答は先頭側
      const lastB = pb ? pb.lastAnsweredAt : 0;
      if (lastA !== lastB) return lastA - lastB;
      return a.index - b.index;
    })
    .map((item) => item.row);
}

export async function GET(request: NextRequest) {
  return handleGrammarMapQuestionsGet(request);
}
