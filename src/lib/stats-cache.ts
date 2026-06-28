/**
 * Stats Cache Module
 *
 * 統計ページのデータをプリフェッチ・キャッシュするモジュール。
 * Strategy 1: Freeユーザーは home-cache から集計し、DBクエリを排除。
 * Proユーザーは Supabase RPC（1クエリ）を使用。
 */

import { createBrowserClient } from '@/lib/supabase';
import {
  getActivityHistory,
  getDailyStats,
  getWrongAnswers,
  getStreakDays,
  getGuestUserId,
  getWeeklyStats,
  type DailyActivity,
  type WeeklyStatsEntry,
} from '@/lib/utils';
import { getCachedProjects, getCachedProjectWords, getHasLoaded } from '@/lib/home-cache';
import { isRemoteStatsSyncEnabled } from '@/lib/stats-sync-config';
import { summarizeWordMemory } from '@/lib/words/memory';
import type { SubscriptionStatus, Word } from '@/types';

export interface CachedStats {
  totalProjects: number;
  totalWords: number;
  masteredWords: number;
  activeWords: number;
  reviewWords: number;
  newWords: number;
  favoriteWords: number;
  wrongAnswersCount: number;
  quizStats: {
    todayCount: number;
    correctCount: number;
    streakDays: number;
    lastQuizDate: string | null;
  };
  weeklyStats: WeeklyStatsEntry[];
  activityHistory: DailyActivity[];
}

// Module-level cache
let cachedStats: CachedStats | null = null;
let cachedUserId: string | null = null;
let fetchPromise: Promise<CachedStats | null> | null = null;
let fetchPromiseUserId: string | null = null;
let cacheVersion = 0;

const ACTIVITY_HISTORY_WEEKS = 12;
const ACTIVITY_HISTORY_DAYS = ACTIVITY_HISTORY_WEEKS * 7;

function isAuthenticatedStatsUser(userId: string): boolean {
  return userId !== 'server-side' && userId !== 'guest_fallback' && !userId.startsWith('guest_');
}

function makeDateKey(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function buildActivityHistoryWindow(
  entries: DailyActivity[],
  weeks: number = ACTIVITY_HISTORY_WEEKS,
): DailyActivity[] {
  const map = new Map(entries.map((entry) => [entry.date, entry]));
  const days = weeks * 7;
  const result: DailyActivity[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = makeDateKey(i);
    result.push(map.get(date) ?? { date, quizCount: 0, correctCount: 0 });
  }

  return result;
}

function mergeActivityHistories(
  cached: DailyActivity[],
  local: DailyActivity[],
): DailyActivity[] {
  const map = new Map<string, DailyActivity>();

  for (const entry of [...cached, ...local]) {
    const existing = map.get(entry.date);
    if (!existing) {
      map.set(entry.date, { ...entry });
      continue;
    }
    existing.quizCount = Math.max(existing.quizCount, entry.quizCount);
    existing.correctCount = Math.max(existing.correctCount, entry.correctCount);
  }

  return buildActivityHistoryWindow(Array.from(map.values()));
}

function mergeWeeklyStats(
  cached: WeeklyStatsEntry[],
  local: WeeklyStatsEntry[],
): WeeklyStatsEntry[] {
  const map = new Map<string, WeeklyStatsEntry>();

  for (const entry of [...cached, ...local]) {
    const existing = map.get(entry.date);
    if (!existing) {
      map.set(entry.date, { ...entry });
      continue;
    }
    existing.totalCount = Math.max(existing.totalCount, entry.totalCount);
    existing.correctCount = Math.max(existing.correctCount, entry.correctCount);
    existing.masteredCount = Math.max(existing.masteredCount, entry.masteredCount);
  }

  const result: WeeklyStatsEntry[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = makeDateKey(i);
    result.push(map.get(date) ?? { date, totalCount: 0, correctCount: 0, masteredCount: 0 });
  }
  return result;
}

function activityHistoryToWeeklyStats(history: DailyActivity[]): WeeklyStatsEntry[] {
  const map = new Map(history.map((entry) => [entry.date, entry]));
  const result: WeeklyStatsEntry[] = [];

  for (let i = 13; i >= 0; i--) {
    const date = makeDateKey(i);
    const entry = map.get(date);
    result.push({
      date,
      totalCount: entry?.quizCount ?? 0,
      correctCount: entry?.correctCount ?? 0,
      masteredCount: 0,
    });
  }

  return result;
}

/**
 * 実際のWordデータから14日間の日別習得数を計算する。
 * 各日にmastered状態になった単語数（lastReviewedAt基準）を表示。
 * quiz activityカウント(totalCount, correctCount)はlocalStorageから取得。
 */
function buildMasteryHistory(
  allWords: Word[],
  activityEntries: WeeklyStatsEntry[] = getWeeklyStats(),
): WeeklyStatsEntry[] {
  const result: WeeklyStatsEntry[] = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dateStr = d.toISOString().split('T')[0];

    const startOfDayISO = d.toISOString();
    const endOfDay = new Date(d);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const endOfDayISO = endOfDay.toISOString();

    // その日に習得した単語数（proxyDateがその日の範囲内）
    const dailyMastered = allWords.filter(word => {
      if (word.status !== 'mastered') return false;
      const proxyDate = word.lastReviewedAt ?? word.createdAt;
      return proxyDate >= startOfDayISO && proxyDate < endOfDayISO;
    }).length;

    const localEntry = activityEntries.find(e => e.date === dateStr);
    result.push({
      date: dateStr,
      totalCount: localEntry?.totalCount ?? 0,
      correctCount: localEntry?.correctCount ?? 0,
      masteredCount: dailyMastered,
    });
  }
  return result;
}

/**
 * キャッシュ済みの統計データを返す（なければnull）
 */
export function getCachedStats(): CachedStats | null {
  if (!cachedStats) return null;

  // localStorageデータは常に最新を反映
  const dailyStats = getDailyStats();
  const wrongAnswers = getWrongAnswers();
  const streakDays = getStreakDays();
  const activityHistory = mergeActivityHistories(cachedStats.activityHistory, getActivityHistory(ACTIVITY_HISTORY_WEEKS));

  // weeklyStatsのquiz activityカウントのみlocalStorageから更新
  // masteredCountはWordデータから計算済みなのでキャッシュ値を保持
  const mergedWeeklyStats = mergeWeeklyStats(cachedStats.weeklyStats, getWeeklyStats());

  return {
    ...cachedStats,
    wrongAnswersCount: Math.max(cachedStats.wrongAnswersCount, wrongAnswers.length),
    weeklyStats: mergedWeeklyStats,
    activityHistory,
    quizStats: {
      ...cachedStats.quizStats,
      todayCount: Math.max(cachedStats.quizStats.todayCount, dailyStats.todayCount),
      correctCount: Math.max(cachedStats.quizStats.correctCount, dailyStats.correctCount),
      streakDays: Math.max(cachedStats.quizStats.streakDays, streakDays),
    },
  };
}

export function getCachedStatsForUser(userId: string): CachedStats | null {
  if (cachedUserId !== userId) return null;
  return getCachedStats();
}

/**
 * キャッシュされたユーザーIDを返す
 */
export function getCachedUserId(): string | null {
  return cachedUserId;
}

/**
 * バックグラウンドで統計データをプリフェッチする。
 * Freeユーザー: home-cache から即座に集計（DBクエリなし）
 * Proユーザー: Supabase RPC 1クエリ
 */
export function prefetchStats(
  subscriptionStatus: SubscriptionStatus,
  userId: string | null,
  isPro: boolean,
  wasPro: boolean = false,
): void {
  const resolvedUserId = userId ?? getGuestUserId();

  // 同じユーザーのキャッシュが既にあればスキップ
  if (cachedStats && cachedUserId === resolvedUserId) return;

  // 既にフェッチ中ならスキップ
  if (fetchPromise && fetchPromiseUserId === resolvedUserId) return;

  const promise = fetchStatsData(subscriptionStatus, resolvedUserId, isPro, wasPro);
  fetchPromise = promise;
  fetchPromiseUserId = resolvedUserId;
  void promise.finally(() => {
    if (fetchPromise === promise) {
      fetchPromise = null;
      fetchPromiseUserId = null;
    }
  });
}

/**
 * 統計データを取得する。キャッシュがあれば即返し、なければフェッチ。
 */
export async function getStats(
  subscriptionStatus: SubscriptionStatus,
  userId: string | null,
  isPro: boolean,
  wasPro: boolean = false,
): Promise<CachedStats | null> {
  const resolvedUserId = userId ?? getGuestUserId();

  // キャッシュがあれば即返す
  if (cachedStats && cachedUserId === resolvedUserId) {
    return getCachedStatsForUser(resolvedUserId);
  }

  // 同じユーザーのフェッチ中データだけを待つ
  if (fetchPromise && fetchPromiseUserId === resolvedUserId) {
    const result = await fetchPromise;
    if (result) return getCachedStatsForUser(resolvedUserId);
  }

  // フェッチ実行
  const promise = fetchStatsData(subscriptionStatus, resolvedUserId, isPro, wasPro);
  fetchPromise = promise;
  fetchPromiseUserId = resolvedUserId;
  void promise.finally(() => {
    if (fetchPromise === promise) {
      fetchPromise = null;
      fetchPromiseUserId = null;
    }
  });

  const stats = await fetchPromise;
  return stats ?? getCachedStatsForUser(resolvedUserId);
}

/**
 * キャッシュを無効化する（単語追加/削除後など）
 */
export function invalidateStatsCache(): void {
  cachedStats = null;
  cachedUserId = null;
  fetchPromise = null;
  fetchPromiseUserId = null;
  cacheVersion += 1;
}

/**
 * Proユーザー: Supabase RPC 1クエリで集計（高速）
 */
async function fetchStatsViaRpc(userId: string): Promise<{
  totalProjects: number;
  totalWords: number;
  masteredWords: number;
  activeWords: number;
  reviewWords: number;
  newWords: number;
  favoriteWords: number;
}> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.rpc('get_user_stats', { p_user_id: userId });

  if (error) throw error;

  return {
    totalProjects: data.total_projects ?? 0,
    totalWords: data.total_words ?? 0,
    masteredWords: data.mastered_words ?? 0,
    activeWords: data.active_words ?? 0,
    reviewWords: data.review_words ?? 0,
    newWords: data.new_words ?? 0,
    favoriteWords: data.favorite_words ?? 0,
  };
}

type RemoteDailyStatsRow = {
  active_date: string;
  quiz_count: number;
  correct_count: number;
  mastered_count: number;
};

async function fetchRemoteActivityHistory(userId: string): Promise<DailyActivity[]> {
  const supabase = createBrowserClient();
  const { data, error } = await supabase.rpc('get_daily_stats_range', {
    p_user_id: userId,
    p_start_date: makeDateKey(ACTIVITY_HISTORY_DAYS - 1),
    p_end_date: makeDateKey(0),
  });

  if (error) throw error;

  return buildActivityHistoryWindow(
    ((data ?? []) as RemoteDailyStatsRow[]).map((row) => ({
      date: String(row.active_date),
      quizCount: row.quiz_count ?? 0,
      correctCount: row.correct_count ?? 0,
    })),
  );
}

/**
 * Freeユーザー: home-cache から集計（DBクエリゼロ）
 */
function buildStatsFromHomeCache(): {
  totalProjects: number;
  totalWords: number;
  masteredWords: number;
  activeWords: number;
  reviewWords: number;
  newWords: number;
  favoriteWords: number;
  allWords: Word[];
} | null {
  if (!getHasLoaded()) return null;

  const projects = getCachedProjects();
  const projectWords = getCachedProjectWords();

  const allWords: Word[] = [];
  let favoriteWords = 0;

  for (const project of projects) {
    const words = projectWords[project.id] || [];
    allWords.push(...words);
    for (const word of words) {
      if (word.isFavorite) favoriteWords++;
    }
  }

  const memorySummary = summarizeWordMemory(allWords);
  return {
    totalProjects: projects.length,
    totalWords: memorySummary.total,
    masteredWords: memorySummary.mastered,
    activeWords: memorySummary.active,
    reviewWords: memorySummary.learning,
    newWords: memorySummary.unlearned,
    favoriteWords,
    allWords,
  };
}

async function fetchStatsData(
  subscriptionStatus: SubscriptionStatus,
  userId: string,
  isPro?: boolean,
  wasPro?: boolean,
): Promise<CachedStats | null> {
  const requestCacheVersion = cacheVersion;

  try {
    const isProUser = isPro ?? subscriptionStatus === 'active';
    // Downgraded users still have data in Supabase, use RPC to fetch stats
    const hasRemoteData = isProUser || (wasPro ?? false);
    const canUseRemoteStats = isAuthenticatedStatsUser(userId) && isRemoteStatsSyncEnabled();

    // Free: home-cache から即座に集計 / Pro/wasPro: RPC 1クエリ
    let wordStats: {
      totalProjects: number;
      totalWords: number;
      masteredWords: number;
      activeWords: number;
      reviewWords: number;
      newWords: number;
      favoriteWords: number;
    };
    let allWords: Word[] = [];

    if (hasRemoteData) {
      wordStats = await fetchStatsViaRpc(userId);
      try {
        const { getRepository } = await import('@/lib/db');
        const repository = getRepository(subscriptionStatus, wasPro ?? false);
        const projects = await repository.getProjects(userId);
        const allWordsArrays = await Promise.all(projects.map((project) => repository.getWords(project.id)));
        allWords = allWordsArrays.flat();
        const memorySummary = summarizeWordMemory(allWords);
        wordStats = {
          totalProjects: projects.length,
          totalWords: memorySummary.total,
          masteredWords: memorySummary.mastered,
          activeWords: memorySummary.active,
          reviewWords: memorySummary.learning,
          newWords: memorySummary.unlearned,
          favoriteWords: allWords.filter((word) => word.isFavorite).length,
        };
      } catch {
        // Fetch mastered words directly from Supabase for mastery history chart
        try {
          const supabase = createBrowserClient();
          const { data, error } = await supabase
            .from('words')
            .select('status, created_at, last_reviewed_at')
            .eq('user_id', userId)
            .eq('status', 'mastered');
          if (!error && data) {
            allWords = data.map(row => ({
              status: row.status,
              createdAt: row.created_at,
              lastReviewedAt: row.last_reviewed_at ?? undefined,
            })) as unknown as Word[];
          }
        } catch {
          // Fallback: mastery history will be empty
        }
      }
    } else {
      // Try home-cache first (no DB query)
      const cached = buildStatsFromHomeCache();
      if (cached) {
        const { allWords: words, ...stats } = cached;
        wordStats = stats;
        allWords = words;
      } else {
        // Fallback: home-cache not ready yet, use repository
        const { getRepository } = await import('@/lib/db');
        const repository = getRepository(subscriptionStatus);
        const projects = await repository.getProjects(userId);
        const allWordsArrays = await Promise.all(
          projects.map((project) => repository.getWords(project.id))
        );
        allWords = allWordsArrays.flat();

        let favoriteWords = 0;

        for (const word of allWords) {
          if (word.isFavorite) favoriteWords++;
        }

        const memorySummary = summarizeWordMemory(allWords);
        wordStats = {
          totalProjects: projects.length,
          totalWords: memorySummary.total,
          masteredWords: memorySummary.mastered,
          activeWords: memorySummary.active,
          reviewWords: memorySummary.learning,
          newWords: memorySummary.unlearned,
          favoriteWords,
        };
      }
    }

    const dailyStats = getDailyStats();
    const wrongAnswers = getWrongAnswers();
    const streakDays = getStreakDays();
    let activityHistory = getActivityHistory(ACTIVITY_HISTORY_WEEKS);

    // Authenticated users store non-word learning stats in Supabase. Local
    // values remain an instant cache and offline fallback.
    let wrongAnswersCount = wrongAnswers.length;
    let finalStreakDays = streakDays;
    let todayCount = dailyStats.todayCount;
    let correctCount = dailyStats.correctCount;

    if (canUseRemoteStats) {
      try {
        const supabase = createBrowserClient();
        const [wrongCountResult, streakResult, remoteActivityHistory] = await Promise.all([
          supabase.from('user_wrong_answers').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('user_streak').select('streak_count, last_activity_date').eq('user_id', userId).maybeSingle(),
          fetchRemoteActivityHistory(userId),
        ]);

        if (wrongCountResult.count !== null && wrongCountResult.count !== undefined) {
          wrongAnswersCount = Math.max(wrongAnswersCount, wrongCountResult.count);
        }

        if (streakResult.data) {
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const lastDate = streakResult.data.last_activity_date;
          if (lastDate === today || lastDate === yesterday) {
            finalStreakDays = Math.max(finalStreakDays, streakResult.data.streak_count);
          }
        }

        activityHistory = mergeActivityHistories(remoteActivityHistory, activityHistory);
        const today = makeDateKey(0);
        const todayRemote = remoteActivityHistory.find((entry) => entry.date === today);
        if (todayRemote) {
          todayCount = Math.max(todayCount, todayRemote.quizCount);
          correctCount = Math.max(correctCount, todayRemote.correctCount);
        }
      } catch {
        // Fallback to local values
      }
    }

    const weeklyStats = buildMasteryHistory(allWords, activityHistoryToWeeklyStats(activityHistory));

    const stats: CachedStats = {
      ...wordStats,
      wrongAnswersCount,
      weeklyStats,
      activityHistory,
      quizStats: {
        todayCount,
        correctCount,
        streakDays: finalStreakDays,
        lastQuizDate: null,
      },
    };

    if (requestCacheVersion === cacheVersion) {
      cachedStats = stats;
      cachedUserId = userId;
    }

    return stats;
  } catch (error) {
    console.error('Failed to prefetch stats:', error);
    return null;
  }
}
