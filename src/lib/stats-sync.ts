/**
 * Stats Sync Module
 *
 * Handles synchronization of quiz stats, streak, and wrong answers
 * between localStorage and Supabase for Pro users.
 *
 * Strategy:
 * - Write: localStorage first → async Supabase sync (fire-and-forget)
 * - Read: On mount, pull from Supabase and merge into localStorage
 * - Merge: Counters use GREATEST(), wrong_answers use union merge
 */

import { createBrowserClient } from '@/lib/supabase';
import type { WrongAnswer, DailyActivity } from '@/lib/utils';

// ---- Sync daily stats ----

export async function syncDailyStats(
  userId: string,
  date: string,
  quizCount: number,
  correctCount: number,
  masteredCount: number,
): Promise<void> {
  try {
    const supabase = createBrowserClient();
    const { error } = await supabase.rpc('upsert_daily_stats', {
      p_user_id: userId,
      p_date: date,
      p_quiz_count: quizCount,
      p_correct_count: correctCount,
      p_mastered_count: masteredCount,
    });
    if (error) console.error('[StatsSync] syncDailyStats error:', error);
  } catch (e) {
    console.error('[StatsSync] syncDailyStats exception:', e);
  }
}

// ---- Sync streak ----

export async function syncStreak(
  userId: string,
  streakCount: number,
  lastActivityDate: string,
): Promise<void> {
  try {
    const supabase = createBrowserClient();
    const { error } = await supabase.rpc('upsert_user_streak', {
      p_user_id: userId,
      p_streak_count: streakCount,
      p_last_activity_date: lastActivityDate,
    });
    if (error) console.error('[StatsSync] syncStreak error:', error);
  } catch (e) {
    console.error('[StatsSync] syncStreak exception:', e);
  }
}

// ---- Sync wrong answers ----

export async function syncWrongAnswer(
  userId: string,
  wrongAnswer: WrongAnswer,
): Promise<void> {
  try {
    const supabase = createBrowserClient();
    const { error } = await supabase
      .from('user_wrong_answers')
      .upsert(
        {
          user_id: userId,
          word_id: wrongAnswer.wordId,
          project_id: wrongAnswer.projectId,
          english: wrongAnswer.english,
          japanese: wrongAnswer.japanese,
          distractors: wrongAnswer.distractors,
          wrong_count: wrongAnswer.wrongCount,
          last_wrong_at: new Date(wrongAnswer.lastWrongAt).toISOString(),
        },
        { onConflict: 'user_id,word_id' },
      );
    if (error) console.error('[StatsSync] syncWrongAnswer error:', error);
  } catch (e) {
    console.error('[StatsSync] syncWrongAnswer exception:', e);
  }
}

export async function syncRemoveWrongAnswer(
  userId: string,
  wordId: string,
): Promise<void> {
  try {
    const supabase = createBrowserClient();
    const { error } = await supabase
      .from('user_wrong_answers')
      .delete()
      .eq('user_id', userId)
      .eq('word_id', wordId);
    if (error) console.error('[StatsSync] syncRemoveWrongAnswer error:', error);
  } catch (e) {
    console.error('[StatsSync] syncRemoveWrongAnswer exception:', e);
  }
}

export async function syncClearAllWrongAnswers(userId: string): Promise<void> {
  try {
    const supabase = createBrowserClient();
    const { error } = await supabase
      .from('user_wrong_answers')
      .delete()
      .eq('user_id', userId);
    if (error) console.error('[StatsSync] syncClearAllWrongAnswers error:', error);
  } catch (e) {
    console.error('[StatsSync] syncClearAllWrongAnswers exception:', e);
  }
}

// ---- Pull from remote → merge into localStorage ----

const DAILY_STATS_KEY = 'scanvocab_daily_stats';
const STREAK_KEY = 'scanvocab_streak';
const LAST_ACTIVITY_KEY = 'scanvocab_last_activity';
const WRONG_ANSWERS_KEY = 'scanvocab_wrong_answers';
const ACTIVITY_HISTORY_KEY = 'scanvocab_activity_history';

export async function pullStatsFromRemote(userId: string): Promise<void> {
  try {
    const supabase = createBrowserClient();

    // Pull in parallel
    const [streakResult, wrongResult, activityResult] = await Promise.all([
      supabase.from('user_streak').select('*').eq('user_id', userId).single(),
      supabase.from('user_wrong_answers').select('*').eq('user_id', userId),
      supabase.rpc('get_daily_stats_range', {
        p_user_id: userId,
        p_start_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        p_end_date: new Date().toISOString().split('T')[0],
      }),
    ]);

    // Merge streak
    if (streakResult.data && !streakResult.error) {
      const remote = streakResult.data;
      const localStreak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
      const localLastActivity = localStorage.getItem(LAST_ACTIVITY_KEY) || '';
      const remoteLastActivity = remote.last_activity_date;

      // Pick the one with the later date; if same date, pick larger streak
      if (remoteLastActivity > localLastActivity) {
        localStorage.setItem(STREAK_KEY, String(remote.streak_count));
        localStorage.setItem(LAST_ACTIVITY_KEY, remoteLastActivity);
      } else if (remoteLastActivity === localLastActivity) {
        const mergedStreak = Math.max(localStreak, remote.streak_count);
        localStorage.setItem(STREAK_KEY, String(mergedStreak));
      }
      // else: local is newer, keep local
    }

    // Merge wrong answers (union by wordId, pick higher wrongCount)
    if (wrongResult.data && !wrongResult.error) {
      const localWrong: WrongAnswer[] = JSON.parse(
        localStorage.getItem(WRONG_ANSWERS_KEY) || '[]',
      );
      const localMap = new Map(localWrong.map((w) => [w.wordId, w]));

      for (const r of wrongResult.data) {
        const existing = localMap.get(r.word_id);
        if (existing) {
          // Merge: pick higher count, later timestamp
          existing.wrongCount = Math.max(existing.wrongCount, r.wrong_count);
          existing.lastWrongAt = Math.max(
            existing.lastWrongAt,
            new Date(r.last_wrong_at).getTime(),
          );
          if (r.distractors?.length > 0) {
            existing.distractors = r.distractors;
          }
        } else {
          localMap.set(r.word_id, {
            wordId: r.word_id,
            projectId: r.project_id,
            english: r.english,
            japanese: r.japanese,
            distractors: r.distractors || [],
            wrongCount: r.wrong_count,
            lastWrongAt: new Date(r.last_wrong_at).getTime(),
          });
        }
      }

      localStorage.setItem(
        WRONG_ANSWERS_KEY,
        JSON.stringify(Array.from(localMap.values())),
      );
    }

    // Merge activity history (heatmap data)
    if (activityResult.data && !activityResult.error) {
      const localHistory: DailyActivity[] = JSON.parse(
        localStorage.getItem(ACTIVITY_HISTORY_KEY) || '[]',
      );
      const localMap = new Map(localHistory.map((h) => [h.date, h]));

      for (const r of activityResult.data as { active_date: string; quiz_count: number; correct_count: number }[]) {
        const existing = localMap.get(r.active_date);
        if (existing) {
          existing.quizCount = Math.max(existing.quizCount, r.quiz_count);
          existing.correctCount = Math.max(existing.correctCount, r.correct_count);
        } else {
          localMap.set(r.active_date, {
            date: r.active_date,
            quizCount: r.quiz_count,
            correctCount: r.correct_count,
          });
        }
      }

      localStorage.setItem(
        ACTIVITY_HISTORY_KEY,
        JSON.stringify(Array.from(localMap.values())),
      );

      // Also update today's daily stats if remote has data
      const today = new Date().toISOString().split('T')[0];
      const todayRemote = (activityResult.data as { active_date: string; quiz_count: number; correct_count: number; mastered_count: number }[])
        .find((r) => r.active_date === today);
      if (todayRemote) {
        const stored = localStorage.getItem(DAILY_STATS_KEY);
        let localStats = { date: today, todayCount: 0, correctCount: 0, masteredCount: 0 };
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.date === today) localStats = parsed;
          } catch { /* ignore */ }
        }
        localStats.todayCount = Math.max(localStats.todayCount, todayRemote.quiz_count);
        localStats.correctCount = Math.max(localStats.correctCount, todayRemote.correct_count);
        localStats.masteredCount = Math.max(localStats.masteredCount, todayRemote.mastered_count);
        localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(localStats));
      }
    }

    console.log('[StatsSync] Pull from remote complete');
  } catch (e) {
    console.error('[StatsSync] pullStatsFromRemote exception:', e);
  }
}

// ---- Push localStorage → Supabase (initial Pro migration) ----

export async function pushLocalStatsToRemote(userId: string): Promise<void> {
  try {
    // Push streak
    const streak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (streak > 0 && lastActivity) {
      await syncStreak(userId, streak, lastActivity);
    }

    // Push wrong answers
    const wrongAnswers: WrongAnswer[] = JSON.parse(
      localStorage.getItem(WRONG_ANSWERS_KEY) || '[]',
    );
    for (const wa of wrongAnswers) {
      await syncWrongAnswer(userId, wa);
    }

    // Push activity history
    const history: DailyActivity[] = JSON.parse(
      localStorage.getItem(ACTIVITY_HISTORY_KEY) || '[]',
    );
    for (const day of history) {
      if (day.quizCount > 0) {
        await syncDailyStats(userId, day.date, day.quizCount, day.correctCount, 0);
      }
    }

    // Push today's daily stats
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(DAILY_STATS_KEY);
    if (stored) {
      try {
        const stats = JSON.parse(stored);
        if (stats.date === today && stats.todayCount > 0) {
          await syncDailyStats(userId, today, stats.todayCount, stats.correctCount, stats.masteredCount);
        }
      } catch { /* ignore */ }
    }

    console.log('[StatsSync] Push local stats to remote complete');
  } catch (e) {
    console.error('[StatsSync] pushLocalStatsToRemote exception:', e);
  }
}
