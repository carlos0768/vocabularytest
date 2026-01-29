/**
 * Stats Cache Module
 *
 * 統計ページのデータをプリフェッチ・キャッシュするモジュール。
 * ホーム画面マウント時にバックグラウンドでデータを取得し、
 * 統計ページを開いたときに即座に表示できるようにする。
 */

import { getRepository } from '@/lib/db';
import { getDailyStats, getWrongAnswers, getStreakDays, getGuestUserId } from '@/lib/utils';
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
 * 既にフェッチ中なら重複実行しない。
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

  fetchPromise = fetchStatsData(subscriptionStatus, resolvedUserId)
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
  const stats = await fetchStatsData(subscriptionStatus, resolvedUserId);
  return stats || getCachedStats()!;
}

/**
 * キャッシュを無効化する（単語追加/削除後など）
 */
export function invalidateStatsCache(): void {
  cachedStats = null;
  cachedUserId = null;
}

async function fetchStatsData(
  subscriptionStatus: SubscriptionStatus,
  userId: string,
): Promise<CachedStats | null> {
  try {
    const repository = getRepository(subscriptionStatus);
    const projects = await repository.getProjects(userId);

    // 全プロジェクトの単語を並行取得
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

    const dailyStats = getDailyStats();
    const wrongAnswers = getWrongAnswers();
    const streakDays = getStreakDays();

    const stats: CachedStats = {
      totalProjects: projects.length,
      totalWords,
      masteredWords,
      reviewWords,
      newWords,
      favoriteWords,
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
