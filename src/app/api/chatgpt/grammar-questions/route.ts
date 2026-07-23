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
      .select('id,sentence,choices,correct_index,explanation,grammar_point,sentence_ja')
      .eq('user_id', auth.user.id)
      .eq('book_id', bookId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[chatgpt/grammar-questions] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: '問題の取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      questions: ((data ?? []) as GrammarQuestionRow[]).map((row) => ({
        id: row.id,
        sentence: row.sentence,
        choices: row.choices,
        correctIndex: row.correct_index,
        explanation: row.explanation,
        grammarPoint: row.grammar_point,
        sentenceJa: row.sentence_ja,
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
