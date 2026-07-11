import { countHomeWordStatuses } from '@/lib/home/home-page-selectors';
import { getWordsDueForReview } from '@/lib/spaced-repetition';
import { getDailyStats, getStreakDays } from '@/lib/utils';
import { summarizeWordMemory } from '@/lib/words/memory';
import type { Word } from '@/types';

export type DesktopStudySummaryStats = {
  dueCount: number;
  completedToday: number;
  streakDays: number;
  totalWords: number;
  mastered: number;
  activeW: number;
  review: number;
  newW: number;
  // False for a brand-new account whose words have never been quizzed (no review
  // schedule yet). Lets the sidebar show a small learning target instead of "0語".
  hasReviewSchedule: boolean;
};

export const EMPTY_DESKTOP_STUDY_SUMMARY: DesktopStudySummaryStats = {
  dueCount: 0,
  completedToday: 0,
  streakDays: 0,
  totalWords: 0,
  mastered: 0,
  activeW: 0,
  review: 0,
  newW: 0,
  hasReviewSchedule: false,
};

export function buildDesktopStudySummaryStats(words: Word[]): DesktopStudySummaryStats {
  const daily = getDailyStats();
  const statusCounts = countHomeWordStatuses(words);
  const memorySummary = summarizeWordMemory(words);

  return {
    dueCount: getWordsDueForReview(words).length,
    completedToday: daily.todayCount,
    streakDays: getStreakDays(),
    totalWords: memorySummary.total,
    mastered: statusCounts.masteredTotal,
    activeW: statusCounts.activeTotal,
    review: statusCounts.learningTotal,
    newW: statusCounts.unlearnedTotal,
    hasReviewSchedule: words.some((word) => Boolean(word.nextReviewAt) || Boolean(word.lastReviewedAt)),
  };
}
