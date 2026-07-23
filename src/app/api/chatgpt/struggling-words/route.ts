import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProUser } from '@/lib/api/pro-auth';
import { aggregateUserMissedWords, type UserMissedWordRow } from '@/lib/quiz-misses/server';

/**
 * GET /api/chatgpt/struggling-words
 *
 * ChatGPT Custom GPT (GPT Actions) 向けの「苦手な単語」取得ルート (Pro限定)。
 * quiz_word_misses (クイズ誤答ログ) を本人スコープで読み、単語ごとに
 * 誤答回数を集計して回数順で返す。ChatGPT側で復習クイズや例文練習に使う。
 * quiz_word_misses には select_own の RLS があるため、Bearer スコープの
 * クライアントでそのまま読める (admin 不要)。
 */

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();

// 集計対象として読む誤答ログの最大行数 (直近から)。グループ版の実装
// (listStudyGroupStrugglingWords) と同じ発想の上限。
const MISS_LOG_FETCH_LIMIT = 1000;

type ChatGptStrugglingWordsDeps = {
  requirePro: typeof requireProUser;
};

const defaultDeps: ChatGptStrugglingWordsDeps = {
  requirePro: requireProUser,
};

export async function handleChatGptStrugglingWordsGet(
  request: NextRequest,
  deps: ChatGptStrugglingWordsDeps = defaultDeps,
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
      .from('quiz_word_misses')
      .select('english_key,english,japanese,created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(MISS_LOG_FETCH_LIMIT);

    if (error) {
      console.error('[chatgpt/struggling-words] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: '苦手な単語の取得に失敗しました' }, { status: 500 });
    }

    const aggregated = aggregateUserMissedWords((data ?? []) as UserMissedWordRow[]);

    return NextResponse.json({
      success: true,
      words: aggregated.slice(0, parsed.data.limit),
      totalCount: aggregated.length,
    });
  } catch (error) {
    console.error('[chatgpt/struggling-words] error:', error);
    return NextResponse.json({ success: false, error: '苦手な単語の取得に失敗しました' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleChatGptStrugglingWordsGet(request);
}
