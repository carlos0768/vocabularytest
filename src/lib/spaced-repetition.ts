/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Based on the SuperMemo 2 algorithm by Piotr Wozniak.
 * Calculates optimal review intervals based on answer quality.
 *
 * Quality mapping (simplified):
 * - Correct answer: quality = 4 (correct with some hesitation)
 * - Wrong answer: quality = 1 (complete blackout)
 */

import type { Word } from '@/types';

// SM-2 algorithm constants
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Calculate the next review schedule based on SM-2 algorithm
 *
 * @param isCorrect - Whether the answer was correct
 * @param word - The word being reviewed
 * @returns Updated spaced repetition fields
 */
export function calculateNextReview(
  isCorrect: boolean,
  word: Word
): {
  easeFactor: number;
  intervalDays: number;
  repetition: number;
  nextReviewAt: string;
  lastReviewedAt: string;
} {
  const now = new Date();
  const lastReviewedAt = now.toISOString();

  // Map correct/incorrect to quality score (0-5 scale)
  // Correct = 4 (correct response with hesitation)
  // Wrong = 1 (incorrect but remembered upon seeing correct)
  const quality = isCorrect ? 4 : 1;

  let { easeFactor, intervalDays, repetition } = word;

  // Ensure defaults
  easeFactor = easeFactor ?? DEFAULT_EASE_FACTOR;
  intervalDays = intervalDays ?? 0;
  repetition = repetition ?? 0;

  if (quality >= 3) {
    // Correct answer - increase interval
    if (repetition === 0) {
      intervalDays = 1; // First review: 1 day
    } else if (repetition === 1) {
      intervalDays = 6; // Second review: 6 days
    } else {
      // Subsequent reviews: multiply by ease factor
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetition += 1;
  } else {
    // Wrong answer - reset repetition count
    repetition = 0;
    intervalDays = 1; // Review again tomorrow
  }

  // Update ease factor based on quality
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const efChange = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor + efChange);

  // Calculate next review date
  const nextReviewDate = new Date(now);
  nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);
  const nextReviewAt = nextReviewDate.toISOString();

  return {
    easeFactor,
    intervalDays,
    repetition,
    nextReviewAt,
    lastReviewedAt,
  };
}

/**
 * Get words that are due for review
 *
 * @param words - All words in a project
 * @returns Words that need to be reviewed (nextReviewAt <= now or never reviewed)
 */
export function getWordsDueForReview(words: Word[]): Word[] {
  const now = new Date();

  return words.filter((word) => {
    // Never reviewed - always due
    if (!word.nextReviewAt) {
      return true;
    }

    // Check if review date has passed
    const nextReview = new Date(word.nextReviewAt);
    return nextReview <= now;
  });
}

/**
 * Get count of words due for review
 *
 * @param words - All words in a project
 * @returns Number of words that need review
 */
export function getReviewCount(words: Word[]): number {
  return getWordsDueForReview(words).length;
}

/**
 * Initialize spaced repetition fields for a new word
 *
 * @returns Default spaced repetition values
 */
export function getDefaultSpacedRepetitionFields(): {
  easeFactor: number;
  intervalDays: number;
  repetition: number;
} {
  return {
    easeFactor: DEFAULT_EASE_FACTOR,
    intervalDays: 0,
    repetition: 0,
  };
}
