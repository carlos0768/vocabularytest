import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { requireProUser } from '@/lib/api/pro-auth';

/**
 * GET/POST /api/chatgpt/projects
 *
 * ChatGPT Custom GPT (GPT Actions) 向けの単語帳一覧・作成ルート (Pro限定)。
 * ChatGPT が「どの単語帳に追加するか」を解決するために使う。
 * クエリは RLS スコープの client (auth.supabase) で行い、
 * 50 単語帳キャップ等のサーバー側制約は DB 側 (RLS + trigger) に委ねる。
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
}).strict();

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
}).strict();

type ProjectRow = {
  id: string;
  title: string;
  updated_at: string;
};

type ChatGptProjectsDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: ChatGptProjectsDeps = {
  requirePro: requireProUser,
};

export async function handleChatGptProjectsGet(
  request: NextRequest,
  deps: ChatGptProjectsDeps = defaultDeps,
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
      .from('projects')
      .select('id,title,updated_at')
      .eq('user_id', auth.user.id)
      .order('updated_at', { ascending: false })
      .limit(parsed.data.limit);

    if (error) {
      console.error('[chatgpt/projects] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: '単語帳の取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      projects: ((data ?? []) as ProjectRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('[chatgpt/projects] error:', error);
    return NextResponse.json({ success: false, error: '単語帳の取得に失敗しました' }, { status: 500 });
  }
}

export async function handleChatGptProjectsPost(
  request: NextRequest,
  deps: ChatGptProjectsDeps = defaultDeps,
) {
  try {
    const auth = await deps.requirePro(request);
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = await parseJsonWithSchema(request, createSchema, {
      invalidMessage: '単語帳のタイトルを指定してください',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const { data, error } = await auth.supabase
      .from('projects')
      .insert({
        user_id: auth.user.id,
        title: parsed.data.title,
      })
      .select('id,title')
      .single();

    if (error || !data) {
      // Pro 前提のルートだが、期限切れ直後などに DB トリガーの
      // 50 単語帳キャップへ到達した場合はアップグレード案内として返す。
      if (error?.message?.includes('FREE_WORDBOOK_LIMIT_EXCEEDED')) {
        return NextResponse.json(
          { success: false, error: '単語帳の上限に達しています。Proプランをご確認ください。' },
          { status: 403 },
        );
      }
      console.error('[chatgpt/projects] create failed:', error?.message);
      return NextResponse.json({ success: false, error: '単語帳の作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      project: {
        id: data.id as string,
        title: data.title as string,
      },
    });
  } catch (error) {
    console.error('[chatgpt/projects] error:', error);
    return NextResponse.json({ success: false, error: '単語帳の作成に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleChatGptProjectsGet(request);
}

export async function POST(request: NextRequest) {
  return handleChatGptProjectsPost(request);
}
