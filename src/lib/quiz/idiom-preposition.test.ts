import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getIdiomHiddenAnswer,
  maskIdiomPrepositions,
  splitIdiomPrepositions,
} from './idiom-preposition';

test('splitIdiomPrepositions hides only the prepositions of an idiom', () => {
  assert.deepEqual(splitIdiomPrepositions('look forward to ~ing'), [
    { text: 'look forward', hidden: false },
    { text: 'to', hidden: true },
    { text: '~ing', hidden: false },
  ]);
});

test('splitIdiomPrepositions handles several prepositions and is case-insensitive', () => {
  const segments = splitIdiomPrepositions('In spite of');
  assert.deepEqual(segments, [
    { text: 'In', hidden: true },
    { text: 'spite', hidden: false },
    { text: 'of', hidden: true },
  ]);
  assert.equal(getIdiomHiddenAnswer(segments!), 'In of');
  assert.equal(maskIdiomPrepositions(segments!), '___ spite ___');
});

test('splitIdiomPrepositions returns null for anything that is not an idiom with a preposition', () => {
  assert.equal(splitIdiomPrepositions('apple'), null);
  assert.equal(splitIdiomPrepositions('to'), null);
  assert.equal(splitIdiomPrepositions('ice cream'), null);
  // 前置詞しか無いと見せる部分が残らない
  assert.equal(splitIdiomPrepositions('up to'), null);
  // as / like は伏せない
  assert.equal(splitIdiomPrepositions('as soon as'), null);
  assert.equal(splitIdiomPrepositions('   '), null);
  assert.equal(splitIdiomPrepositions(undefined), null);
  // 古典語 (ラテン文字なし)
  assert.equal(splitIdiomPrepositions('いとをかし'), null);
});

test('splitIdiomPrepositions keeps the answer for phrasal verbs with particles', () => {
  const segments = splitIdiomPrepositions('look up to');
  assert.equal(getIdiomHiddenAnswer(segments!), 'up to');
  assert.equal(maskIdiomPrepositions(segments!), 'look ___ ___');
});
