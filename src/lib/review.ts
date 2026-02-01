/**
 * Today's Review - 今日の復習
 *
 * Collects words due for review from all projects,
 * sorted by priority (overdue days desc, then easeFactor asc).
 */

import type { Word, Project } from '@/types';

export interface ReviewWord {
  word: Word;
  projectId: string;
  projectName: string;
  daysOverdue: number;
}

/**
 * Check if a word is due for review today.
 * Words with no nextReviewAt (never reviewed) are always due.
 */
export function isReviewDue(word: Word): boolean {
  if (!word.nextReviewAt) {
    return true;
  }
  const now = new Date();
  const nextReview = new Date(word.nextReviewAt);
  return nextReview <= now;
}

/**
 * Calculate how many days overdue a word is.
 * Returns 0 for words that have never been reviewed.
 */
function getDaysOverdue(word: Word): number {
  if (!word.nextReviewAt) {
    return 0;
  }
  const now = new Date();
  const nextReview = new Date(word.nextReviewAt);
  const diffMs = now.getTime() - nextReview.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Collect today's review words from all projects.
 *
 * @param projectWords - Map of projectId -> Word[]
 * @param projects - All projects (for title lookup)
 * @returns ReviewWord[] sorted by priority:
 *   1. daysOverdue descending (most overdue first)
 *   2. easeFactor ascending (harder words first)
 */
export function getTodayReviewWords(
  projectWords: Record<string, Word[]>,
  projects: Project[]
): ReviewWord[] {
  const projectMap = new Map(projects.map(p => [p.id, p.title]));
  const reviewWords: ReviewWord[] = [];

  for (const [projectId, words] of Object.entries(projectWords)) {
    const projectName = projectMap.get(projectId) || '';
    for (const word of words) {
      if (isReviewDue(word)) {
        reviewWords.push({
          word,
          projectId,
          projectName,
          daysOverdue: getDaysOverdue(word),
        });
      }
    }
  }

  // Sort: most overdue first, then lowest easeFactor first (hardest)
  reviewWords.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) {
      return b.daysOverdue - a.daysOverdue;
    }
    return (a.word.easeFactor ?? 2.5) - (b.word.easeFactor ?? 2.5);
  });

  return reviewWords;
}
