import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireProUser } from '@/lib/api/pro-auth';
import { publicQuestionsForNode } from '@/lib/grammar/map';
import { findGrammarSource } from '@/lib/grammar/sources';
import { findGrammarSubUnit, findGrammarUnit } from '@/lib/grammar/taxonomy';

/**
 * GET /api/grammar/map/questions?nodeId=... (Pro限定)
 *
 * 文法マップのノード (大単元なら配下の小単元すべて) に属する公開問題を返す。
 * 問題は公開ソース由来のアプリ内バンクなので、DBの問題テーブルは読まない。
 * 並べ替えのためだけに本人の習得度 (grammar_map_progress) を参照する。
 */

const querySchema = z.object({
  // ノードIDはスラッグ (英小文字+数字+ハイフン) のみ
  nodeId: z.string().trim().min(1).max(60).regex(/^[a-z][a-z0-9-]*$/),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
}).strict();

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
    const nodeLabel = findGrammarUnit(nodeId)?.label ?? findGrammarSubUnit(nodeId)?.sub.label;
    if (!nodeLabel) {
      return NextResponse.json({ success: false, error: '指定した文法項目が見つかりません' }, { status: 404 });
    }

    const questions = publicQuestionsForNode(nodeId);
    const ordered = await orderByProgress(auth.supabase, auth.user.id, questions);
    const selected = ordered.slice(0, limit);

    // CC BY は帰属表示が必要なので、出題した問題のソースを併せて返す
    const sources = Array.from(new Set(selected.map((question) => question.sourceId)))
      .map((id) => findGrammarSource(id))
      .filter((source): source is NonNullable<typeof source> => source !== null)
      .map((source) => ({ title: source.title, license: source.licenseLabel, url: source.url }));

    return NextResponse.json({
      success: true,
      nodeId,
      nodeLabel,
      totalMatched: questions.length,
      sources,
      questions: selected.map((question) => ({
        id: question.id,
        nodeId: question.nodeId,
        sentence: question.sentence,
        choices: question.choices,
        correctIndex: question.correctIndex,
        explanation: question.explanation,
        sentenceJa: question.sentenceJa,
      })),
    });
  } catch (error) {
    console.error('[grammar/map/questions] error:', error);
    return NextResponse.json({ success: false, error: '問題の取得に失敗しました' }, { status: 500 });
  }
}

/**
 * 未回答 → 苦手 → 習得済み の順に並べ替える。
 * 習得度が読めない環境では元の収録順のまま返す。
 */
async function orderByProgress<T extends { id: string }>(
  supabase: SupabaseClient,
  userId: string,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;

  const progressResult = await supabase
    .from('grammar_map_progress')
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
  for (const row of progressRows) {
    progressByQuestion.set(row.question_id, {
      mastered: Boolean(row.mastered),
      lastAnsweredAt: row.last_answered_at ? Date.parse(row.last_answered_at) || 0 : 0,
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
