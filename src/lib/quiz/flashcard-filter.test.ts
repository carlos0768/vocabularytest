import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countFlashcardFilters,
  filterFlashcardWords,
  isFlashcardFilter,
  matchesFlashcardFilter,
} from '@/lib/quiz/flashcard-filter';
import type { Word } from '@/types';

function word(overrides: Partial<Word> & { id: string }): Word {
  return {
    projectId: 'p1',
    english: overrides.english ?? `word-${overrides.id}`,
    japanese: overrides.japanese ?? '意味',
    status: 'new',
    isFavorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Word;
}

const wrongCounts = new Map<string, number>([['w2', 3]]);

test('all keeps every word and preserves the deck order', () => {
  const words = [word({ id: 'w1' }), word({ id: 'w2' }), word({ id: 'w3' })];

  assert.deepEqual(
    filterFlashcardWords(words, 'all', wrongCounts).map((item) => item.id),
    ['w1', 'w2', 'w3'],
  );
});

test('favorite keeps only saved words', () => {
  const words = [word({ id: 'w1', isFavorite: true }), word({ id: 'w2' })];

  assert.deepEqual(
    filterFlashcardWords(words, 'favorite', wrongCounts).map((item) => item.id),
    ['w1'],
  );
});

test('wrong keeps only words with a recorded miss', () => {
  const words = [word({ id: 'w1' }), word({ id: 'w2' })];

  assert.deepEqual(
    filterFlashcardWords(words, 'wrong', wrongCounts).map((item) => item.id),
    ['w2'],
  );
});

test('unmastered drops mastered words', () => {
  const words = [word({ id: 'w1', status: 'mastered' }), word({ id: 'w2', status: 'review' })];

  assert.deepEqual(
    filterFlashcardWords(words, 'unmastered', wrongCounts).map((item) => item.id),
    ['w2'],
  );
});

test('matchesFlashcardFilter treats an unknown miss count as zero', () => {
  assert.equal(matchesFlashcardFilter(word({ id: 'w9' }), 'wrong', new Map()), false);
});

test('countFlashcardFilters counts each axis independently', () => {
  const words = [
    word({ id: 'w1', isFavorite: true, status: 'mastered' }),
    word({ id: 'w2', status: 'review' }),
    word({ id: 'w3', status: 'mastered' }),
  ];

  assert.deepEqual(countFlashcardFilters(words, wrongCounts), {
    all: 3,
    favorite: 1,
    wrong: 1,
    unmastered: 1,
  });
});

test('isFlashcardFilter rejects anything outside the known axes', () => {
  assert.equal(isFlashcardFilter('favorite'), true);
  assert.equal(isFlashcardFilter('everything'), false);
  assert.equal(isFlashcardFilter(null), false);
});
