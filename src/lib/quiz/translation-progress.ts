import type { WordTranslation } from '@/types';

export type TranslationProgressUpdates = Pick<
  WordTranslation,
  'status' | 'lastReviewedAt' | 'nextReviewAt' | 'easeFactor' | 'intervalDays' | 'repetition'
>;

export function mapTranslationProgressUpdatesToRow(
  updates: TranslationProgressUpdates,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.lastReviewedAt !== undefined) row.last_reviewed_at = updates.lastReviewedAt;
  if (updates.nextReviewAt !== undefined) row.next_review_at = updates.nextReviewAt;
  if (updates.easeFactor !== undefined) row.ease_factor = updates.easeFactor;
  if (updates.intervalDays !== undefined) row.interval_days = updates.intervalDays;
  if (updates.repetition !== undefined) row.repetition = updates.repetition;
  return row;
}
