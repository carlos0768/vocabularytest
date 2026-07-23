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
};

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
      .select('id,title,updated_at')
      .eq('user_id', auth.user.id)
      .order('updated_at', { ascending: false })
      .limit(parsed.data.limit);

    if (error) {
      console.error('[chatgpt/grammar-books] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: '問題集の取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      books: ((data ?? []) as GrammarBookRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
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
