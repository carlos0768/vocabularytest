import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import { listFollowingTodayActivity } from '@/lib/follows/server';

/** フォロー中のユーザーのうち、今日 (JST) クイズを解いた人と問題数。ホームのカード列用。 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  try {
    const activity = await listFollowingTodayActivity(auth.user.id);
    return NextResponse.json({ success: true, activity });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'today_activity_fetch_failed' },
      { status: 500 },
    );
  }
}
