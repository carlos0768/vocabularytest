/**
 * Stats Cache Module
 *
 * 統計ページのデータをプリフェッチ・キャッシュするモジュール。
 * Strategy 1: Freeユーザーは home-cache から集計し、DBクエリを排除。
 * Proユーザーは Supabase RPC（1クエリ）を使用。
 */

import { createBrowserClient } from '@/lib/supabase';
import { getDailyStats, getWrongAnswers, getStreakDays, getGuestUserId } from '@/lib/utils';
import { getCachedProjects, getCachedProjectWords, getHasLoaded } from '@/lib/home-cache';
import type { SubscriptionStatus } from '@/types';

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
}

// Module-level cache
let cachedStats: CachedStats | null = null;
let cachedUserId: string | null = null;
let fetchPromise: Promise<CachedStats | null> | null = null;

/**
 * キャッシュ済みの統計データを返す（なければnull）
 */
export function getCachedStats(): CachedStats | null {
  if (!cachedStats) return null;

  // localStorageデータは常に最新を反映
  const dailyStats = getDailyStats();
  const wrongAnswers = getWrongAnswers();
  const streakDays = getStreakDays();

  return {
    ...cachedStats,
    wrongAnswersCount: wrongAnswers.length,
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
): void {
  const resolvedUserId = isPro && userId ? userId : getGuestUserId();

  // 同じユーザーのキャッシュが既にあればスキップ
  if (cachedStats && cachedUserId === resolvedUserId) return;

  // 既にフェッチ中ならスキップ
  if (fetchPromise) return;

  fetchPromise = fetchStatsData(subscriptionStatus, resolvedUserId, isPro)
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
): Promise<CachedStats> {
  const resolvedUserId = isPro && userId ? userId : getGuestUserId();

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
  const stats = await fetchStatsData(subscriptionStatus, resolvedUserId, isPro);
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
} | null {
  if (!getHasLoaded()) return null;

  const projects = getCachedProjects();
  const projectWords = getCachedProjectWords();

  let totalWords = 0;
  let masteredWords = 0;
  let reviewWords = 0;
  let newWords = 0;
  let favoriteWords = 0;

  for (const project of projects) {
    const words = projectWords[project.id] || [];
    totalWords += words.length;
    for (const word of words) {
      if (word.status === 'mastered') masteredWords++;
      else if (word.status === 'review') reviewWords++;
      else newWords++;
      if (word.isFavorite) favoriteWords++;
    }
  }

  return { totalProjects: projects.length, totalWords, masteredWords, reviewWords, newWords, favoriteWords };
}

async function fetchStatsData(
  subscriptionStatus: SubscriptionStatus,
  userId: string,
  isPro?: boolean,
): Promise<CachedStats | null> {
  try {
    const isProUser = isPro ?? subscriptionStatus === 'active';

    // Free: home-cache から即座に集計 / Pro: RPC 1クエリ
    let wordStats: {
      totalProjects: number;
      totalWords: number;
      masteredWords: number;
      reviewWords: number;
      newWords: number;
      favoriteWords: number;
    };

    if (isProUser) {
      wordStats = await fetchStatsViaRpc(userId);
    } else {
      // Try home-cache first (no DB query)
      const cached = buildStatsFromHomeCache();
      if (cached) {
        wordStats = cached;
      } else {
        // Fallback: home-cache not ready yet, use repository
        const { getRepository } = await import('@/lib/db');
        const repository = getRepository(subscriptionStatus);
        const projects = await repository.getProjects(userId);
        const allWordsArrays = await Promise.all(
          projects.map((project) => repository.getWords(project.id))
        );

        let totalWords = 0;
        let masteredWords = 0;
        let reviewWords = 0;
        let newWords = 0;
        let favoriteWords = 0;

        for (const words of allWordsArrays) {
          totalWords += words.length;
          for (const word of words) {
            if (word.status === 'mastered') masteredWords++;
            else if (word.status === 'review') reviewWords++;
            else newWords++;
            if (word.isFavorite) favoriteWords++;
          }
        }

        wordStats = { totalProjects: projects.length, totalWords, masteredWords, reviewWords, newWords, favoriteWords };
      }
    }

    const dailyStats = getDailyStats();
    const wrongAnswers = getWrongAnswers();
    const streakDays = getStreakDays();

    const stats: CachedStats = {
      ...wordStats,
      wrongAnswersCount: wrongAnswers.length,
      quizStats: {
        todayCount: dailyStats.todayCount,
        correctCount: dailyStats.correctCount,
        streakDays,
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
