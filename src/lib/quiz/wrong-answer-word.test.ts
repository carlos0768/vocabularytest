import test from 'node:test';
import assert from 'node:assert/strict';

import type { WrongAnswer } from '@/lib/utils';
import { buildFallbackWordFromWrongAnswer } from './wrong-answer-word';

const wrongAnswer: WrongAnswer = {
  wordId: 'word-1',
  projectId: 'project-1',
  english: 'apple',
  japanese: 'りんご',
  distractors: ['みかん', 'ぶどう', 'もも'],
  wrongCount: 2,
  lastWrongAt: Date.UTC(2026, 0, 2),
};

test('buildFallbackWordFromWrongAnswer rebuilds a due review word from the record', () => {
  const word = buildFallbackWordFromWrongAnswer(wrongAnswer);
  assert.equal(word.id, 'word-1');
  assert.equal(word.projectId, 'project-1');
  assert.equal(word.english, 'apple');
  assert.equal(word.japanese, 'りんご');
  assert.deepEqual(word.distractors, ['みかん', 'ぶどう', 'もも']);
  assert.equal(word.status, 'review');
  assert.equal(word.createdAt, '2026-01-02T00:00:00.000Z');
  assert.equal(word.lastReviewedAt, '2026-01-02T00:00:00.000Z');
  // due immediately
  assert.equal(word.nextReviewAt, new Date(0).toISOString());
});

test('buildFallbackWordFromWrongAnswer tolerates a broken timestamp', () => {
  const before = Date.now();
  const word = buildFallbackWordFromWrongAnswer({ ...wrongAnswer, lastWrongAt: Number.NaN });
  assert.ok(Date.parse(word.createdAt) >= before);
});
