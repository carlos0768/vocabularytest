/**
 * Stats Cache Module
 *
 * 統計ページのデータをプリフェッチ・キャッシュするモジュール。
 * Strategy 1: Freeユーザーは home-cache から集計し、DBクエリを排除。
 * Proユーザーは Supabase RPC（1クエリ）を使用。
 */

import { createBrowserClient } from '@/lib/supabase';
import { getDailyStats, getWrongAnswers, getStreakDays, getGuestUserId, getWeeklyStats, type WeeklyStatsEntry } from '@/lib/utils';
import { getCachedProjects, getCachedProjectWords, getHasLoaded } from '@/lib/home-cache';
import { isRemoteStatsSyncEnabled } from '@/lib/stats-sync-config';
import type { SubscriptionStatus, Word } from '@/types';

export interface CachedStats {
  totalProjects: number;
  totalWords: number;
  masteredWords: number;
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
}

// Module-level cache
let cachedStats: CachedStats | null = null;
let cachedUserId: string | null = null;
let fetchPromise: Promise<CachedStats | null> | null = null;

/**
 * 実際のWordデータから14日間の日別習得数を計算する。
 * 各日にmastered状態になった単語数（lastReviewedAt基準）を表示。
 * quiz activityカウント(totalCount, correctCount)はlocalStorageから取得。
 */
function buildMasteryHistory(allWords: Word[]): WeeklyStatsEntry[] {
  const localEntries = getWeeklyStats();
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

    const localEntry = localEntries.find(e => e.date === dateStr);
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

  // weeklyStatsのquiz activityカウントのみlocalStorageから更新
  // masteredCountはWordデータから計算済みなのでキャッシュ値を保持
  const localEntries = getWeeklyStats();
  const mergedWeeklyStats = cachedStats.weeklyStats.map(entry => {
    const localEntry = localEntries.find(e => e.date === entry.date);
    return {
      ...entry,
      totalCount: localEntry?.totalCount ?? entry.totalCount,
      correctCount: localEntry?.correctCount ?? entry.correctCount,
    };
  });

  return {
    ...cachedStats,
    wrongAnswersCount: wrongAnswers.length,
    weeklyStats: mergedWeeklyStats,
    quizStats: {
      ...cachedStats.quizStats,
      todayCount: dailyStats.todayCount,
      correctCount: dailyStats.correctCount,
      streakDays,
    },
  };
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
  if (fetchPromise) return;

  fetchPromise = fetchStatsData(subscriptionStatus, resolvedUserId, isPro, wasPro)
    .finally(() => {
      fetchPromise = null;
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
): Promise<CachedStats> {
  const resolvedUserId = userId ?? getGuestUserId();

  // キャッシュがあれば即返す
  if (cachedStats && cachedUserId === resolvedUserId) {
    return getCachedStats()!;
  }

  // フェッチ中ならそれを待つ
  if (fetchPromise) {
    const result = await fetchPromise;
    if (result) return getCachedStats()!;
  }

  // フェッチ実行
  const stats = await fetchStatsData(subscriptionStatus, resolvedUserId, isPro, wasPro);
  return stats || getCachedStats()!;
}

/**
 * キャッシュを無効化する（単語追加/削除後など）
 */
export function invalidateStatsCache(): void {
  cachedStats = null;
  cachedUserId = null;
}

/**
 * Proユーザー: Supabase RPC 1クエリで集計（高速）
 */
async function fetchStatsViaRpc(userId: string): Promise<{
  totalProjects: number;
  totalWords: number;
  masteredWords: number;
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
    reviewWords: data.review_words ?? 0,
    newWords: data.new_words ?? 0,
    favoriteWords: data.favorite_words ?? 0,
  };
}

/**
 * Freeユーザー: home-cache から集計（DBクエリゼロ）
 */
function buildStatsFromHomeCache(): {
  totalProjects: number;
  totalWords: number;
  masteredWords: number;
  reviewWords: number;
  newWords: number;
  favoriteWords: number;
  allWords: Word[];
} | null {
  if (!getHasLoaded()) return null;

  const projects = getCachedProjects();
  const projectWords = getCachedProjectWords();

  const allWords: Word[] = [];
  let totalWords = 0;
  let masteredWords = 0;
  let reviewWords = 0;
  let newWords = 0;
  let favoriteWords = 0;

  for (const project of projects) {
    const words = projectWords[project.id] || [];
    allWords.push(...words);
    totalWords += words.length;
    for (const word of words) {
      if (word.status === 'mastered') masteredWords++;
      else if (word.status === 'review') reviewWords++;
      else newWords++;
      if (word.isFavorite) favoriteWords++;
    }
  }

  return { totalProjects: projects.length, totalWords, masteredWords, reviewWords, newWords, favoriteWords, allWords };
}

async function fetchStatsData(
  subscriptionStatus: SubscriptionStatus,
  userId: string,
  isPro?: boolean,
  wasPro?: boolean,
): Promise<CachedStats | null> {
  try {
    const isProUser = isPro ?? subscriptionStatus === 'active';
    // Downgraded users still have data in Supabase, use RPC to fetch stats
    const hasRemoteData = isProUser || (wasPro ?? false);

    // Free: home-cache から即座に集計 / Pro/wasPro: RPC 1クエリ
    let wordStats: {
      totalProjects: number;
      totalWords: number;
      masteredWords: number;
      reviewWords: number;
      newWords: number;
      favoriteWords: number;
    };
    let allWords: Word[] = [];

    if (hasRemoteData) {
      wordStats = await fetchStatsViaRpc(userId);
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

        let totalWords = 0;
        let masteredWords = 0;
        let reviewWords = 0;
        let newWords = 0;
        let favoriteWords = 0;

        for (const word of allWords) {
          totalWords++;
          if (word.status === 'mastered') masteredWords++;
          else if (word.status === 'review') reviewWords++;
          else newWords++;
          if (word.isFavorite) favoriteWords++;
        }

        wordStats = { totalProjects: projects.length, totalWords, masteredWords, reviewWords, newWords, favoriteWords };
      }
    }

    const dailyStats = getDailyStats();
    const wrongAnswers = getWrongAnswers();
    const streakDays = getStreakDays();

    // For Pro users, also fetch remote wrong answer count and streak
    // to ensure we show the most complete data
    let wrongAnswersCount = wrongAnswers.length;
    let finalStreakDays = streakDays;

    if (hasRemoteData && isRemoteStatsSyncEnabled()) {
      try {
        const supabase = createBrowserClient();
        const [wrongCountResult, streakResult] = await Promise.all([
          supabase.from('user_wrong_answers').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('user_streak').select('streak_count, last_activity_date').eq('user_id', userId).maybeSingle(),
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
      } catch {
        // Fallback to local values
      }
    }

    const weeklyStats = buildMasteryHistory(allWords);

    const stats: CachedStats = {
      ...wordStats,
      wrongAnswersCount,
      weeklyStats,
      quizStats: {
        todayCount: dailyStats.todayCount,
        correctCount: dailyStats.correctCount,
        streakDays: finalStreakDays,
        lastQuizDate: null,
      },
    };

    cachedStats = stats;
    cachedUserId = userId;

    return stats;
  } catch (error) {
    console.error('Failed to prefetch stats:', error);
    return null;
  }
}
