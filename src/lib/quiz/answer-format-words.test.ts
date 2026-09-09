import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countWordsByAnswerFormat,
  filterWordsForAnswerFormat,
  matchesAnswerFormat,
} from './answer-format-words';

const active = { vocabularyType: 'active' as const };
const passive = { vocabularyType: 'passive' as const };
const unset = { vocabularyType: null };
const missing = {};

test('記述は発信 (A) だけ、四択は受信 (P) だけを出す', () => {
  assert.equal(matchesAnswerFormat(active, 'typing'), true);
  assert.equal(matchesAnswerFormat(active, 'normal'), false);
  assert.equal(matchesAnswerFormat(passive, 'normal'), true);
  assert.equal(matchesAnswerFormat(passive, 'typing'), false);
});

test('語彙モード未設定は受信あつかい', () => {
  // 未設定をどちらにも入れないと、公式単語帳の取り込みのように未設定で入る語が
  // どちらの解き方でも一切出題されなくなる。
  assert.equal(matchesAnswerFormat(unset, 'normal'), true);
  assert.equal(matchesAnswerFormat(unset, 'typing'), false);
  assert.equal(matchesAnswerFormat(missing, 'normal'), true);
  assert.equal(matchesAnswerFormat(missing, 'typing'), false);
});

test('絞り込みは並びを変えない', () => {
  const words = [
    { id: 'a', vocabularyType: 'passive' as const },
    { id: 'b', vocabularyType: 'active' as const },
    { id: 'c', vocabularyType: null },
    { id: 'd', vocabularyType: 'active' as const },
  ];
  assert.deepEqual(filterWordsForAnswerFormat(words, 'typing').map((w) => w.id), ['b', 'd']);
  assert.deepEqual(filterWordsForAnswerFormat(words, 'normal').map((w) => w.id), ['a', 'c']);
});

test('2つの解き方で数えると必ず全語になる', () => {
  const words = [active, passive, unset, active, missing];
  const counts = countWordsByAnswerFormat(words);
  assert.equal(counts.typing, 2);
  assert.equal(counts.normal, 3);
  assert.equal(counts.typing + counts.normal, words.length);
});

test('空の単語帳は両方0', () => {
  assert.deepEqual(countWordsByAnswerFormat([]), { typing: 0, normal: 0 });
});
