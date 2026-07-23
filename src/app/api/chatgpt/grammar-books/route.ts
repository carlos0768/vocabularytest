import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * GET/POST /api/chatgpt/grammar-books
 *
 * ChatGPT Custom GPT (GPT Actions) 向けの文法・語法問題集の一覧・作成 (Pro限定)。
 * Vintage型 (空欄補充・英語4択・解説つき) の問題集で、単語帳 (projects) とは
 * 別テーブルのため混合できない。作成・問題生成は ChatGPT 経由のみ。
 * grammar_books は本人限定RLSがあるため Bearer スコープの client で操作する。
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
}).strict();

type GrammarBookRow = {
  id: string;
  title: string;
  updated_at: string;
  is_favorite: boolean;
};

// book_id -> 件数 に集計する
function countByBook(rows: { book_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.book_id, (counts.get(row.book_id) ?? 0) + 1);
  }
  return counts;
}

type ChatGptGrammarBooksDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: ChatGptGrammarBooksDeps = {
  requirePro: requireProUser,
};

export async function handleChatGptGrammarBooksGet(
  request: NextRequest,
  deps: ChatGptGrammarBooksDeps = defaultDeps,
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

    const { data, error } = await auth.supabase
      .from('grammar_books')
      .select('id,title,updated_at,is_favorite')
      .eq('user_id', auth.user.id)
      .order('updated_at', { ascending: false })
      .limit(parsed.data.limit);

    if (error) {
      console.error('[chatgpt/grammar-books] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: '問題集の取得に失敗しました' }, { status: 500 });
    }

    const books = (data ?? []) as GrammarBookRow[];

    // 習得度表示のため、問題数と習得済み数を本人スコープで集計する。
    const [questionsResult, masteredResult] = await Promise.all([
      auth.supabase
        .from('grammar_questions')
        .select('book_id')
        .eq('user_id', auth.user.id),
      auth.supabase
        .from('grammar_question_progress')
        .select('book_id')
        .eq('user_id', auth.user.id)
        .eq('mastered', true),
    ]);

    if (questionsResult.error || masteredResult.error) {
      console.error(
        '[chatgpt/grammar-books] stats fetch failed:',
        questionsResult.error?.message ?? masteredResult.error?.message,
      );
      return NextResponse.json({ success: false, error: '問題集の取得に失敗しました' }, { status: 500 });
    }

    const questionCounts = countByBook((questionsResult.data ?? []) as { book_id: string }[]);
    const masteredCounts = countByBook((masteredResult.data ?? []) as { book_id: string }[]);

    return NextResponse.json({
      success: true,
      books: books.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
        isFavorite: row.is_favorite ?? false,
        questionCount: questionCounts.get(row.id) ?? 0,
        masteredCount: masteredCounts.get(row.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error('[chatgpt/grammar-books] error:', error);
    return NextResponse.json({ success: false, error: '問題集の取得に失敗しました' }, { status: 500 });
  }
}

export async function handleChatGptGrammarBooksPost(
  request: NextRequest,
  deps: ChatGptGrammarBooksDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, createSchema, {
      invalidMessage: '問題集のタイトルを指定してください',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { data, error } = await auth.supabase
      .from('grammar_books')
      .insert({
        user_id: auth.user.id,
        title: parsed.data.title,
      })
      .select('id,title')
      .single();

    if (error || !data) {
      console.error('[chatgpt/grammar-books] create failed:', error?.message);
      return NextResponse.json({ success: false, error: '問題集の作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      book: {
        id: data.id as string,
        title: data.title as string,
      },
    });
  } catch (error) {
    console.error('[chatgpt/grammar-books] error:', error);
    return NextResponse.json({ success: false, error: '問題集の作成に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleChatGptGrammarBooksGet(request);
}

export async function POST(request: NextRequest) {
  return handleChatGptGrammarBooksPost(request);
}
