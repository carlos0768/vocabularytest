import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * GET/POST /api/chatgpt/grammar-misses (Pro限定)
 *
 * 語法問題の誤答ログ。
 * - POST: アプリの演習画面 (/grammar/[bookId]) が不正解のたびに記録する
 * - GET: ChatGPT が「間違えた語法問題」を誤答回数順に取得し、
 *   再出題・解説のやり直しに使う (quiz_word_misses の語法版)
 * grammar_question_misses は本人限定RLSのため Bearer/cookie スコープの
 * クライアントでそのまま読み書きできる。
 */

const recordSchema = z.object({
  questionId: z.string().uuid(),
  bookId: z.string().uuid(),
}).strict();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
}).strict();

// 集計対象として読む誤答ログの最大行数 (直近から)
const MISS_LOG_FETCH_LIMIT = 500;

type MissRow = {
  question_id: string;
  created_at: string;
};

type QuestionRow = {
  id: string;
  book_id: string;
  sentence: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  grammar_point: string | null;
  sentence_ja: string | null;
};

export type AggregatedGrammarMiss = {
  questionId: string;
  missCount: number;
  lastMissedAt: string;
};

// newest-first の誤答ログを問題ごとに集計し、回数降順 → 新しい順で返す
export function aggregateGrammarMisses(rows: MissRow[]): AggregatedGrammarMiss[] {
  const aggregated = new Map<string, AggregatedGrammarMiss>();

  for (const row of rows) {
    const existing = aggregated.get(row.question_id);
    if (existing) {
      existing.missCount += 1;
    } else {
      aggregated.set(row.question_id, {
        questionId: row.question_id,
        missCount: 1,
        lastMissedAt: row.created_at,
      });
    }
  }

  return Array.from(aggregated.values()).sort((a, b) => {
    if (b.missCount !== a.missCount) return b.missCount - a.missCount;
    return b.lastMissedAt.localeCompare(a.lastMissedAt);
  });
}

type ChatGptGrammarMissesDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: ChatGptGrammarMissesDeps = {
  requirePro: requireProUser,
};

export async function handleChatGptGrammarMissesPost(
  request: NextRequest,
  deps: ChatGptGrammarMissesDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, recordSchema, {
      invalidMessage: '無効な記録データです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { questionId, bookId } = parsed.data;

    // 自分の問題に対する誤答のみ記録できる
    const { data: question, error: questionError } = await auth.supabase
      .from('grammar_questions')
      .select('id')
      .eq('id', questionId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (questionError) {
      console.error('[chatgpt/grammar-misses] question lookup failed:', questionError.message);
      return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
    }
    if (!question) {
      return NextResponse.json({ success: false, error: '指定した問題にアクセスできません' }, { status: 403 });
    }

    const { error } = await auth.supabase
      .from('grammar_question_misses')
      .insert({
        user_id: auth.user.id,
        question_id: questionId,
        book_id: bookId,
      });

    if (error) {
      console.error('[chatgpt/grammar-misses] insert failed:', error.message);
      return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chatgpt/grammar-misses] error:', error);
    return NextResponse.json({ success: false, error: '記録に失敗しました' }, { status: 500 });
  }
}

export async function handleChatGptGrammarMissesGet(
  request: NextRequest,
  deps: ChatGptGrammarMissesDeps = defaultDeps,
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

    const { data: missRows, error: missError } = await auth.supabase
      .from('grammar_question_misses')
      .select('question_id,created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(MISS_LOG_FETCH_LIMIT);

    if (missError) {
      console.error('[chatgpt/grammar-misses] fetch failed:', missError.message);
      return NextResponse.json({ success: false, error: '誤答の取得に失敗しました' }, { status: 500 });
    }

    const aggregated = aggregateGrammarMisses((missRows ?? []) as MissRow[]).slice(0, parsed.data.limit);
    if (aggregated.length === 0) {
      return NextResponse.json({ success: true, questions: [], totalCount: 0 });
    }

    const { data: questionRows, error: questionError } = await auth.supabase
      .from('grammar_questions')
      .select('id,book_id,sentence,choices,correct_index,explanation,grammar_point,sentence_ja')
      .eq('user_id', auth.user.id)
      .in('id', aggregated.map((miss) => miss.questionId));

    if (questionError) {
      console.error('[chatgpt/grammar-misses] question fetch failed:', questionError.message);
      return NextResponse.json({ success: false, error: '誤答の取得に失敗しました' }, { status: 500 });
    }

    const questionById = new Map(((questionRows ?? []) as QuestionRow[]).map((row) => [row.id, row]));
    const questions = aggregated
      .map((miss) => {
        const row = questionById.get(miss.questionId);
        if (!row) return null;
        return {
          id: row.id,
          bookId: row.book_id,
          sentence: row.sentence,
          choices: row.choices,
          correctIndex: row.correct_index,
          explanation: row.explanation,
          grammarPoint: row.grammar_point,
          sentenceJa: row.sentence_ja,
          missCount: miss.missCount,
          lastMissedAt: miss.lastMissedAt,
        };
      })
      .filter((question): question is NonNullable<typeof question> => question !== null);

    return NextResponse.json({
      success: true,
      questions,
      totalCount: questions.length,
    });
  } catch (error) {
    console.error('[chatgpt/grammar-misses] error:', error);
    return NextResponse.json({ success: false, error: '誤答の取得に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleChatGptGrammarMissesGet(request);
}

export async function POST(request: NextRequest) {
  return handleChatGptGrammarMissesPost(request);
}
