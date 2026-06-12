import assert from 'node:assert/strict';
import test from 'node:test';
import type { Word } from '@/types';
import {
  REMINDER_QUIZ_TOTAL_COUNT,
  parseReminderPriorityIds,
  selectReminderQuizWords,
} from './reminder-quiz';

const NOW = new Date('2026-06-11T00:00:00.000Z');

function makeWord(id: string, overrides: Partial<Word> = {}): Word {
  return {
    id,
    projectId: 'p1',
    english: `english-${id}`,
    japanese: `japanese-${id}`,
    status: 'new',
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    distractors: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  } as Word;
}

test('parseReminderPriorityIds splits, trims, and caps ids', () => {
  assert.deepEqual(parseReminderPriorityIds(null), []);
  assert.deepEqual(parseReminderPriorityIds('a, b ,,c'), ['a', 'b', 'c']);
  assert.deepEqual(
    parseReminderPriorityIds('a,b,c,d,e,f,g'),
    ['a', 'b', 'c', 'd', 'e'],
  );
});

test('selectReminderQuizWords places priority ids first, in order', () => {
  const words = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'].map((id) => makeWord(id));
  const selected = selectReminderQuizWords({
    words,
    priorityIds: ['w5', 'w3', 'w1'],
    now: NOW,
  });

  assert.deepEqual(selected.slice(0, 3).map((w) => w.id), ['w5', 'w3', 'w1']);
  assert.equal(selected.length, 7);
  assert.equal(new Set(selected.map((w) => w.id)).size, 7);
});

test('selectReminderQuizWords fills priority slots with due reviews then wrong answers', () => {
  const words = [
    makeWord('due-later', { nextReviewAt: '2026-06-11T10:00:00.000Z', status: 'review' }),
    makeWord('due-soon', { nextReviewAt: '2026-06-10T00:00:00.000Z', status: 'review' }),
    makeWord('future', { nextReviewAt: '2026-06-20T00:00:00.000Z', status: 'review' }),
    makeWord('wrong-old'),
    makeWord('wrong-recent'),
    makeWord('plain-1'),
    makeWord('plain-2'),
  ];
  const selected = selectReminderQuizWords({
    words,
    priorityIds: ['missing-id'],
    wrongAnswers: [
      { wordId: 'wrong-old', lastWrongAt: 1 },
      { wordId: 'wrong-recent', lastWrongAt: 2 },
      { wordId: 'due-soon', lastWrongAt: 3 },
    ],
    now: NOW,
  });

  // Due words sorted soonest-first, then wrong answers newest-first
  // (due-soon is deduped from the wrong-answer list), then the rest of the
  // pool in normal study-priority order.
  assert.deepEqual(
    selected.map((w) => w.id),
    ['due-soon', 'due-later', 'wrong-recent', 'wrong-old', 'plain-1', 'plain-2', 'future'],
  );
});

test('selectReminderQuizWords caps the quiz at ten words', () => {
  const words = Array.from({ length: 25 }, (_, index) => makeWord(`w${index}`));
  const selected = selectReminderQuizWords({ words, now: NOW });
  assert.equal(selected.length, REMINDER_QUIZ_TOTAL_COUNT);
});

test('selectReminderQuizWords returns whole pool when fewer than ten words', () => {
  const words = [makeWord('w1'), makeWord('w2')];
  const selected = selectReminderQuizWords({ words, now: NOW });
  assert.equal(selected.length, 2);
});
