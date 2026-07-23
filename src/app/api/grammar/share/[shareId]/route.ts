import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * GET  /api/grammar/share/[shareId] — 共有された語法問題集の閲覧 (ログイン必須)
 * POST /api/grammar/share/[shareId] — 自分の問題集として取り込み (Pro限定)
 *
 * 共有元の問題集は他人の行のため本人限定RLSでは読めない。単語帳の共有と
 * 同じく、share_id の完全一致でのみ service-role client で読み出す
 * (一覧・検索はできず、リンクを知っている人だけが到達できる)。
 * 取り込みの書き込みは自分の行なので RLS スコープの client で行う。
 */

const shareIdSchema = z.string().trim().min(6).max(64);

const IMPORT_QUESTION_LIMIT = 200;

type SharedBook = {
  id: string;
  title: string;
};

type SharedQuestionRow = {
  sentence: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  grammar_point: string | null;
  sentence_ja: string | null;
};

async function resolveSharedBook(shareId: string): Promise<{ book: SharedBook; questions: SharedQuestionRow[] } | null> {
  // share_id 完全一致のみ。RLSは本人限定のままにしているため admin client で読む。
  const admin = getSupabaseAdmin();
  const { data: book, error: bookError } = await admin
    .from('grammar_books')
    .select('id,title')
    .eq('share_id', shareId)
    .maybeSingle();

  if (bookError) {
    throw new Error(bookError.message || 'shared_grammar_book_lookup_failed');
  }
  if (!book) return null;

  const { data: questions, error: questionsError } = await admin
    .from('grammar_questions')
    .select('sentence,choices,correct_index,explanation,grammar_point,sentence_ja')
    .eq('book_id', book.id)
    .order('created_at', { ascending: true })
    .limit(IMPORT_QUESTION_LIMIT);

  if (questionsError) {
    throw new Error(questionsError.message || 'shared_grammar_questions_lookup_failed');
  }

  return {
    book: { id: book.id as string, title: book.title as string },
    questions: (questions ?? []) as SharedQuestionRow[],
  };
}

async function resolveAuthenticatedUser(request: NextRequest): Promise<{ id: string } | null> {
  const supabase = await createRouteHandlerClient(request);
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const { data: { user }, error } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id };
}

type ShareViewDeps = {
  resolveUser: typeof resolveAuthenticatedUser;
  requirePro: typeof requireProUser;
  resolveShared: typeof resolveSharedBook;
};

const defaultDeps: ShareViewDeps = {
  resolveUser: resolveAuthenticatedUser,
  requirePro: requireProUser,
  resolveShared: resolveSharedBook,
};

export async function handleGrammarShareGet(
  request: NextRequest,
  context: { params: Promise<{ shareId: string }> },
  deps: ShareViewDeps = defaultDeps,
) {
  try {
    // 閲覧はログイン必須 (プラン不問)。共有単語帳の閲覧と同じ扱い。
    const user = await deps.resolveUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }

    const { shareId } = await context.params;
    const parsedShareId = shareIdSchema.safeParse(shareId);
    if (!parsedShareId.success) {
      return NextResponse.json({ success: false, error: '共有リンクが不正です' }, { status: 400 });
    }

    const shared = await deps.resolveShared(parsedShareId.data);
    if (!shared) {
      return NextResponse.json({ success: false, error: '共有された問題集が見つかりません' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      book: {
        title: shared.book.title,
        questionCount: shared.questions.length,
        // プレビュー: 問題文と文法項目のみ (答え・解説は取り込み後に見られる)
        preview: shared.questions.slice(0, 3).map((question) => ({
          sentence: question.sentence,
          grammarPoint: question.grammar_point,
        })),
      },
    });
  } catch (error) {
    console.error('[grammar/share/[shareId]] get error:', error);
    return NextResponse.json({ success: false, error: '共有された問題集の取得に失敗しました' }, { status: 500 });
  }
}

export async function handleGrammarShareImportPost(
  request: NextRequest,
  context: { params: Promise<{ shareId: string }> },
  deps: ShareViewDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const { shareId } = await context.params;
    const parsedShareId = shareIdSchema.safeParse(shareId);
    if (!parsedShareId.success) {
      return NextResponse.json({ success: false, error: '共有リンクが不正です' }, { status: 400 });
    }

    const shared = await deps.resolveShared(parsedShareId.data);
    if (!shared) {
      return NextResponse.json({ success: false, error: '共有された問題集が見つかりません' }, { status: 404 });
    }

    const supabase: SupabaseClient = auth.supabase;
    const { data: newBook, error: bookError } = await supabase
      .from('grammar_books')
      .insert({
        user_id: auth.user.id,
        title: shared.book.title,
      })
      .select('id,title')
      .single();

    if (bookError || !newBook) {
      console.error('[grammar/share/[shareId]] import book failed:', bookError?.message);
      return NextResponse.json({ success: false, error: '取り込みに失敗しました' }, { status: 500 });
    }

    if (shared.questions.length > 0) {
      const rows = shared.questions.map((question) => ({
        book_id: newBook.id as string,
        user_id: auth.user.id,
        sentence: question.sentence,
        choices: question.choices,
        correct_index: question.correct_index,
        explanation: question.explanation,
        grammar_point: question.grammar_point,
        sentence_ja: question.sentence_ja,
      }));

      const { error: questionsError } = await supabase
        .from('grammar_questions')
        .insert(rows);

      if (questionsError) {
        console.error('[grammar/share/[shareId]] import questions failed:', questionsError.message);
        return NextResponse.json({ success: false, error: '取り込みに失敗しました' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      book: {
        id: newBook.id as string,
        title: newBook.title as string,
        questionCount: shared.questions.length,
      },
    });
  } catch (error) {
    console.error('[grammar/share/[shareId]] import error:', error);
    return NextResponse.json({ success: false, error: '取り込みに失敗しました' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shareId: string }> },
) {
  return handleGrammarShareGet(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ shareId: string }> },
) {
  return handleGrammarShareImportPost(request, context);
}
