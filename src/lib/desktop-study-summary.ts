import { countHomeWordStatuses } from '@/lib/home/home-page-selectors';
import { getWordsDueForReview } from '@/lib/spaced-repetition';
import { getDailyStats, getStreakDays } from '@/lib/utils';
import type { Word } from '@/types';

export type DesktopStudySummaryStats = {
  dueCount: number;
  completedToday: number;
  streakDays: number;
  totalWords: number;
  mastered: number;
  review: number;
  newW: number;
};

export const EMPTY_DESKTOP_STUDY_SUMMARY: DesktopStudySummaryStats = {
  dueCount: 0,
  completedToday: 0,
  streakDays: 0,
  totalWords: 0,
  mastered: 0,
  review: 0,
  newW: 0,
};

export function buildDesktopStudySummaryStats(words: Word[]): DesktopStudySummaryStats {
  const daily = getDailyStats();
  const statusCounts = countHomeWordStatuses(words);

  return {
    dueCount: getWordsDueForReview(words).length,
    completedToday: daily.todayCount,
    streakDays: getStreakDays(),
    totalWords: words.length,
    mastered: statusCounts.masteredTotal,
    review: statusCounts.learningTotal,
    newW: statusCounts.unlearnedTotal,
  };
}
