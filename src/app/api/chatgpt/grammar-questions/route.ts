import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * GET/POST /api/chatgpt/grammar-questions
 *
 * ChatGPT Custom GPT (GPT Actions) 向けの文法・語法問題の追加・取得 (Pro限定)。
 * Vintage型: 空欄補充 (___) の問題文 + 英語4択 + 問題ごとの解説 (必須)。
 * 問題・選択肢・解説はすべて ChatGPT 側で生成して送らせる (サーバー側AIなし)。
 * 単語帳 (words) とは別テーブルのため混合できない。
 */

export const GRAMMAR_BLANK_MARKER = '___';

const questionInputSchema = z.object({
  sentence: z.string().trim().min(1).max(300)
    .refine((value) => value.includes(GRAMMAR_BLANK_MARKER), {
      message: `sentence must contain the blank marker ${GRAMMAR_BLANK_MARKER}`,
    }),
  choices: z.array(z.string().trim().min(1).max(80)).length(4)
    .refine((choices) => new Set(choices.map((c) => c.toLowerCase())).size === 4, {
      message: 'choices must be 4 distinct options',
    }),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(1000),
  grammarPoint: z.string().trim().min(1).max(40).optional(),
  sentenceJa: z.string().trim().min(1).max(300).optional(),
  // 訳を見せないと正解を選べない問題に true。演習で回答前から訳を表示する。
  showTranslation: z.boolean().optional(),
}).strict();

const createSchema = z.object({
  bookId: z.string().uuid(),
  questions: z.array(questionInputSchema).min(1).max(50),
}).strict();

const querySchema = z.object({
  bookId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
}).strict();

type GrammarQuestionRow = {
  id: string;
  sentence: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  grammar_point: string | null;
  sentence_ja: string | null;
  show_translation: boolean;
};

type ChatGptGrammarQuestionsDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: ChatGptGrammarQuestionsDeps = {
  requirePro: requireProUser,
};

async function findOwnedBook(supabase: SupabaseClient, userId: string, bookId: string) {
  const { data, error } = await supabase
    .from('grammar_books')
    .select('id')
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'grammar_book_lookup_failed');
  }

  return data;
}

// 単語帳の間隔反復に相当する出題順。直近で正解して習得済みになった問題を後回しに
// し、未回答・未習得(誤答)の問題を先に出す。演習ページは no-store で都度取得する
// ため、正解して習得済みになった問題は次回以降うしろへ回る。
// grammar_question_progress が無い/取得失敗の環境では元の順序 (作成順) を返す。
async function orderQuestionsBySpacedRepetition<T extends { id: string }>(
  supabase: SupabaseClient,
  userId: string,
  bookId: string,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;

  const progressResult = await supabase
    .from('grammar_question_progress')
    .select('question_id,mastered,last_answered_at')
    .eq('user_id', userId)
    .eq('book_id', bookId);

  if (progressResult.error) {
    console.warn('[chatgpt/grammar-questions] progress order unavailable:', progressResult.error.message);
    return rows;
  }

  const progressByQuestion = new Map<string, { mastered: boolean; lastAnsweredAt: number }>();
  for (const p of (progressResult.data ?? []) as { question_id: string; mastered: boolean; last_answered_at: string | null }[]) {
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
      if (lastA !== lastB) return lastA - lastB; // 最後に解いた時刻が古い順
      return a.index - b.index; // 同点は元の作成順を維持
    })
    .map((item) => item.row);
}

export async function handleChatGptGrammarQuestionsPost(
  request: NextRequest,
  deps: ChatGptGrammarQuestionsDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, createSchema, {
      invalidMessage: '無効な問題データです',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { bookId, questions } = parsed.data;
    const book = await findOwnedBook(auth.supabase, auth.user.id, bookId);
    if (!book) {
      return NextResponse.json({ success: false, error: '指定した問題集にアクセスできません' }, { status: 403 });
    }

    const rows = questions.map((question) => ({
      book_id: bookId,
      user_id: auth.user.id,
      sentence: question.sentence,
      choices: question.choices,
      correct_index: question.correctIndex,
      explanation: question.explanation,
      grammar_point: question.grammarPoint ?? null,
      sentence_ja: question.sentenceJa ?? null,
      show_translation: question.showTranslation ?? false,
    }));

    const { data, error } = await auth.supabase
      .from('grammar_questions')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('[chatgpt/grammar-questions] insert failed:', error.message);
      return NextResponse.json({ success: false, error: '問題の追加に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      addedCount: (data ?? []).length,
    });
  } catch (error) {
    console.error('[chatgpt/grammar-questions] error:', error);
    return NextResponse.json({ success: false, error: '問題の追加に失敗しました' }, { status: 500 });
  }
}

export async function handleChatGptGrammarQuestionsGet(
  request: NextRequest,
  deps: ChatGptGrammarQuestionsDeps = defaultDeps,
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

    const { bookId, limit } = parsed.data;
    const book = await findOwnedBook(auth.supabase, auth.user.id, bookId);
    if (!book) {
      return NextResponse.json({ success: false, error: '指定した問題集にアクセスできません' }, { status: 403 });
    }

    const { data, error } = await auth.supabase
      .from('grammar_questions')
      .select('id,sentence,choices,correct_index,explanation,grammar_point,sentence_ja,show_translation')
      .eq('user_id', auth.user.id)
      .eq('book_id', bookId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[chatgpt/grammar-questions] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: '問題の取得に失敗しました' }, { status: 500 });
    }

    // 単語帳と同じ発想の間隔反復で出題順を並べ替える (習得済みは後回し)。
    const orderedRows = await orderQuestionsBySpacedRepetition(
      auth.supabase,
      auth.user.id,
      bookId,
      (data ?? []) as GrammarQuestionRow[],
    );

    return NextResponse.json({
      success: true,
      questions: orderedRows.map((row) => ({
        id: row.id,
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
    console.error('[chatgpt/grammar-questions] error:', error);
    return NextResponse.json({ success: false, error: '問題の取得に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleChatGptGrammarQuestionsGet(request);
}

export async function POST(request: NextRequest) {
  return handleChatGptGrammarQuestionsPost(request);
}
