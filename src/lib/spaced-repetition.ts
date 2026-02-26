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
import { getDefaultSpacedRepetitionFields } from '../../shared/db';

// Re-export from shared for backwards compatibility
export { getDefaultSpacedRepetitionFields };

// SM-2 algorithm constants
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

function clampQuality(quality: number): ReviewQuality {
  if (quality <= 0) return 0;
  if (quality >= 5) return 5;
  return Math.round(quality) as ReviewQuality;
}

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
  const quality: ReviewQuality = isCorrect ? 4 : 1;
  return calculateNextReviewByQuality(quality, word);
}

/**
 * Calculate the next review schedule based on SM-2 algorithm using direct quality score.
 *
 * Quality scale (0-5):
 * - 0-2: incorrect / poor recall
 * - 3: difficult recall
 * - 4: correct recall
 * - 5: very easy recall
 */
export function calculateNextReviewByQuality(
  qualityInput: ReviewQuality,
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
  const quality = clampQuality(qualityInput);

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
    // Never reviewed and still new - not due for review yet
    if (!word.nextReviewAt) {
      // Only include if the word has been reviewed at least once
      // (has lastReviewedAt or status is not 'new')
      return !!word.lastReviewedAt || word.status !== 'new';
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

const STATUS_PRIORITY: Record<Word['status'], number> = {
  new: 0,
  review: 1,
  mastered: 2,
};

function getReviewBucket(word: Word, nowMs: number): number {
  if (!word.nextReviewAt) return 1;
  const nextMs = Date.parse(word.nextReviewAt);
  if (Number.isNaN(nextMs)) return 1;
  return nextMs <= nowMs ? 0 : 2;
}

/**
 * Compare words by study priority.
 * Lower return value means higher priority.
 */
export function compareWordsByPriority(a: Word, b: Word, now: Date = new Date()): number {
  const nowMs = now.getTime();

  const reviewBucketDiff = getReviewBucket(a, nowMs) - getReviewBucket(b, nowMs);
  if (reviewBucketDiff !== 0) return reviewBucketDiff;

  const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  if (statusDiff !== 0) return statusDiff;

  const createdDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (!Number.isNaN(createdDiff) && createdDiff !== 0) return createdDiff;

  return a.id.localeCompare(b.id);
}

/**
 * Returns a new array sorted by study priority.
 */
export function sortWordsByPriority(words: Word[], now: Date = new Date()): Word[] {
  return [...words].sort((a, b) => compareWordsByPriority(a, b, now));
}
