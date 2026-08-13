import test from 'node:test';
import assert from 'node:assert/strict';

import { voiceQuizBatch } from './voice-quiz-batch';

const pool = Array.from({ length: 25 }, (_, i) => i);

test('the first batch is the head of the pool', () => {
  const { words, nextStart, nextSize } = voiceQuizBatch(pool, 0, 10);
  assert.deepEqual(words, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(nextStart, 10);
  assert.equal(nextSize, 10);
});

test('walking the pool covers every word exactly once', () => {
  const seen: number[] = [];
  let start = 0;

  // 「次の10問」を押し続ける。同じ問題が2度出たら、この比較が落ちる。
  for (let guard = 0; guard < 100; guard += 1) {
    const batch = voiceQuizBatch(pool, start, 10);
    seen.push(...batch.words);
    if (batch.nextSize === 0) break;
    start = batch.nextStart;
  }

  assert.deepEqual(seen, pool);
});

test('the last batch is short when the pool does not divide evenly', () => {
  const { words, nextSize } = voiceQuizBatch(pool, 20, 10);
  assert.deepEqual(words, [20, 21, 22, 23, 24]);
  // 残りが無いので「次の◯問」は出さず、「もう一度」に戻る。
  assert.equal(nextSize, 0);
});

test('a pool shorter than one batch has no next batch', () => {
  const { words, nextSize } = voiceQuizBatch([1, 2, 3], 0, 10);
  assert.deepEqual(words, [1, 2, 3]);
  assert.equal(nextSize, 0);
});

test('an exactly divisible pool ends without an empty extra batch', () => {
  const { words, nextStart, nextSize } = voiceQuizBatch([1, 2, 3], 0, 3);
  assert.deepEqual(words, [1, 2, 3]);
  assert.equal(nextStart, 3);
  // ここで nextSize が 3 のままだと、0問のセッションが始まってしまう。
  assert.equal(nextSize, 0);
});

test('a start past the end yields nothing and does not advance', () => {
  const { words, nextStart, nextSize } = voiceQuizBatch(pool, 99, 10);
  assert.deepEqual(words, []);
  assert.equal(nextStart, 99);
  assert.equal(nextSize, 0);
});

test('an empty pool is not a batch', () => {
  const { words, nextSize } = voiceQuizBatch([], 0, 10);
  assert.deepEqual(words, []);
  assert.equal(nextSize, 0);
});

test('nonsense sizes and starts do not spill the whole pool', () => {
  assert.deepEqual(voiceQuizBatch(pool, -5, 10).words, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(voiceQuizBatch(pool, 0, Number.NaN).words, []);
  assert.equal(voiceQuizBatch(pool, 0, Number.NaN).nextSize, 0);
  assert.deepEqual(voiceQuizBatch(pool, 0, -3).words, []);
});
