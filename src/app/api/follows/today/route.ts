import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listFollowSuggestions, listFollowingTodayActivity } from '@/lib/follows/server';

/**
 * ホームのカード列用。フォロー中のうち今日 (JST) クイズを解いた人と問題数、
 * それに続けて（解いた人がいなければ代わりに）並べるフォローのおすすめ。
 * おすすめの取得に失敗しても、解いた人のカードは出す。
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const [activity, suggestions] = await Promise.all([
      listFollowingTodayActivity(auth.user.id),
      listFollowSuggestions(auth.user.id).catch((error) => {
        console.warn('Failed to load follow suggestions:', error);
        return [];
      }),
    ]);
    return NextResponse.json({ success: true, activity, suggestions });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'today_activity_fetch_failed' },
      { status: 500 },
    );
  }
}
