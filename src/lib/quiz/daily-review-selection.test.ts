import assert from 'node:assert/strict';
import test from 'node:test';

import { cefrRank, selectDailyReviewWords } from '@/lib/quiz/daily-review-selection';
import type { Word } from '@/types';

function word(id: string, cefrLevel?: string): Word {
  return { id, english: id, japanese: id, cefrLevel } as unknown as Word;
}

test('selectDailyReviewWords returns everything when under the limit or unlimited', () => {
  const words = [word('a'), word('b')];
  assert.equal(selectDailyReviewWords(words, [], 50).length, 2);
  assert.equal(selectDailyReviewWords(words, [], 0).length, 2);
});

test('selectDailyReviewWords picks frequently-missed words first, then high CEFR', () => {
  const words = [word('easy', 'A1'), word('hard', 'C2'), word('missed', 'A2'), word('mid', 'B1')];
  const wrongAnswers = [{ wordId: 'missed', wrongCount: 3 }];
  const selected = selectDailyReviewWords(words, wrongAnswers, 2);
  assert.deepEqual(selected.map((w) => w.id), ['missed', 'hard']);
});

test('cefrRank orders known levels and treats unknown as lowest', () => {
  assert.ok(cefrRank('C2') > cefrRank('B1'));
  assert.ok(cefrRank('a2') > cefrRank(undefined));
  assert.equal(cefrRank('unknown'), 0);
});
