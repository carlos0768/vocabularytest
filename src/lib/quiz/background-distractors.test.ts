import test from 'node:test';
import assert from 'node:assert/strict';

import { parseQuizBackgroundDistractorResults } from './background-distractors';

test('parseQuizBackgroundDistractorResults builds distractor, example, and success maps', () => {
  const parsed = parseQuizBackgroundDistractorResults([
    {
      wordId: 'word-1',
      distractors: ['見る', '作る', '探す'],
      exampleSentence: 'I inspect the room.',
      exampleSentenceJa: '私は部屋を調べる。',
    },
    {
      wordId: 'word-2',
      distractors: ['壊す'],
    },
  ]);

  assert.deepEqual([...parsed.distractorMap.entries()], [
    ['word-1', ['見る', '作る', '探す']],
    ['word-2', ['壊す']],
  ]);
  assert.deepEqual([...parsed.exampleMap.entries()], [
    ['word-1', {
      exampleSentence: 'I inspect the room.',
      exampleSentenceJa: '私は部屋を調べる。',
    }],
  ]);
  assert.deepEqual([...parsed.succeededIds], ['word-1', 'word-2']);
});

test('parseQuizBackgroundDistractorResults ignores unusable result rows', () => {
  const parsed = parseQuizBackgroundDistractorResults([
    null,
    { wordId: 'missing-distractors' },
    { wordId: 'empty-distractors', distractors: [] },
    { wordId: 123, distractors: ['見る'] },
  ]);

  assert.equal(parsed.distractorMap.size, 0);
  assert.equal(parsed.exampleMap.size, 0);
  assert.equal(parsed.succeededIds.size, 0);
});
