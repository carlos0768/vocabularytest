import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateNextReview, calculateNextReviewByQuality } from './spaced-repetition';
import type { Word } from '@/types';

const baseWord: Word = {
  id: 'word-1',
  projectId: 'project-1',
  english: 'run',
  japanese: '走る',
  distractors: ['walk', 'eat', 'sleep'],
  status: 'review',
  createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  easeFactor: 2.5,
  intervalDays: 6,
  repetition: 2,
  isFavorite: false,
};

test('calculateNextReviewByQuality resets repetition on low quality', () => {
  const result = calculateNextReviewByQuality(1, baseWord);

  assert.equal(result.repetition, 0);
  assert.equal(result.intervalDays, 1);
  assert.ok(result.easeFactor < baseWord.easeFactor);
});

test('calculateNextReviewByQuality keeps progression on high quality', () => {
  const hard = calculateNextReviewByQuality(3, baseWord);
  const easy = calculateNextReviewByQuality(5, baseWord);

  assert.equal(hard.repetition, 3);
  assert.equal(easy.repetition, 3);
  assert.equal(hard.intervalDays, 15);
  assert.equal(easy.intervalDays, 15);
  assert.ok(easy.easeFactor > hard.easeFactor);
});

test('calculateNextReview remains compatible with boolean API', () => {
  const fromBoolean = calculateNextReview(true, baseWord);
  const fromQuality = calculateNextReviewByQuality(4, baseWord);

  assert.equal(fromBoolean.intervalDays, fromQuality.intervalDays);
  assert.equal(fromBoolean.repetition, fromQuality.repetition);
  assert.equal(fromBoolean.easeFactor, fromQuality.easeFactor);
});
