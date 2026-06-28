/**
 * Server-side public stats builder.
 *
 * Computes a CachedStats-shaped object for an arbitrary user using the
 * service-role client + the same RPCs the client stats use
 * (get_user_stats / get_daily_stats_range) plus the user_streak table.
 *
 * Used by the public profile endpoint so a friend's profile can show their
 * learning record (streak / weekly / heatmap / mastery).
 */
import type { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { CachedStats } from '@/lib/stats-cache';
import type { DailyActivity, WeeklyStatsEntry } from '@/lib/utils';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

const ACTIVITY_HISTORY_WEEKS = 12;
const ACTIVITY_HISTORY_DAYS = ACTIVITY_HISTORY_WEEKS * 7;

function makeDateKey(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

type RemoteDailyStatsRow = {
  active_date: string;
  quiz_count: number;
  correct_count: number;
  mastered_count: number;
};

/**
 * Build a CachedStats object for `userId` from server-side data.
 * Returns null if the core stats RPC fails.
 */
export async function getPublicUserStats(
  userId: string,
  admin: SupabaseAdminClient,
): Promise<CachedStats | null> {
  try {
    // NOTE: get_daily_stats_range RPC blocks service-role callers
    // (it requires auth.uid() === p_user_id), so query the table directly —
    // the service-role client bypasses RLS and can read any user's rows.
    const [statsResult, dailyResult, streakResult] = await Promise.all([
      admin.rpc('get_user_stats', { p_user_id: userId }),
      admin
        .from('user_activity_logs')
        .select('active_date, quiz_count, correct_count, mastered_count')
        .eq('user_id', userId)
        .gte('active_date', makeDateKey(ACTIVITY_HISTORY_DAYS - 1))
        .lte('active_date', makeDateKey(0)),
      admin
        .from('user_streak')
        .select('streak_count, last_activity_date')
        .eq('user_id', userId)
        .maybeSingle<{ streak_count: number; last_activity_date: string | null }>(),
    ]);

    if (statsResult.error || !statsResult.data) return null;
    const s = statsResult.data as Record<string, number>;

    const dailyRows = (dailyResult.error ? [] : (dailyResult.data ?? [])) as RemoteDailyStatsRow[];
    const dailyByDate = new Map(dailyRows.map((row) => [String(row.active_date), row]));

    // 12-week activity history (oldest -> newest), filling gaps with zeros.
    const activityHistory: DailyActivity[] = [];
    for (let i = ACTIVITY_HISTORY_DAYS - 1; i >= 0; i--) {
      const date = makeDateKey(i);
      const row = dailyByDate.get(date);
      activityHistory.push({
        date,
        quizCount: row?.quiz_count ?? 0,
        correctCount: row?.correct_count ?? 0,
      });
    }

    // 14-day weekly stats (mastered from daily mastered_count).
    const weeklyStats: WeeklyStatsEntry[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = makeDateKey(i);
      const row = dailyByDate.get(date);
      weeklyStats.push({
        date,
        totalCount: row?.quiz_count ?? 0,
        correctCount: row?.correct_count ?? 0,
        masteredCount: row?.mastered_count ?? 0,
      });
    }

    // Streak counts only when the last activity was today or yesterday.
    let streakDays = 0;
    if (streakResult.data) {
      const today = makeDateKey(0);
      const yesterday = makeDateKey(1);
      const lastDate = streakResult.data.last_activity_date;
      if (lastDate === today || lastDate === yesterday) {
        streakDays = streakResult.data.streak_count ?? 0;
      }
    }

    const todayRow = dailyByDate.get(makeDateKey(0));

    return {
      totalProjects: s.total_projects ?? 0,
      totalWords: s.total_words ?? 0,
      masteredWords: s.mastered_words ?? 0,
      activeWords: s.active_words ?? 0,
      reviewWords: s.review_words ?? 0,
      newWords: s.new_words ?? 0,
      favoriteWords: s.favorite_words ?? 0,
      wrongAnswersCount: 0,
      quizStats: {
        todayCount: todayRow?.quiz_count ?? 0,
        correctCount: todayRow?.correct_count ?? 0,
        streakDays,
        lastQuizDate: null,
      },
      weeklyStats,
      activityHistory,
    };
  } catch {
    return null;
  }
}
