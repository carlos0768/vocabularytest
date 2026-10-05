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

test('記述は Active (A) だけ、四択は Passive (P) だけを出す', () => {
  assert.equal(matchesAnswerFormat(active, 'typing'), true);
  assert.equal(matchesAnswerFormat(active, 'normal'), false);
  assert.equal(matchesAnswerFormat(passive, 'normal'), true);
  assert.equal(matchesAnswerFormat(passive, 'typing'), false);
});

test('語彙モード未設定は Passive あつかい', () => {
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

test('四択と記述で数えると必ず全語になる', () => {
  const words = [active, passive, unset, active, missing];
  const counts = countWordsByAnswerFormat(words);
  assert.equal(counts.typing, 2);
  assert.equal(counts.normal, 3);
  assert.equal(counts.typing + counts.normal, words.length);
});

test('空の単語帳はどの解き方も0', () => {
  assert.deepEqual(countWordsByAnswerFormat([]), { typing: 0, normal: 0, paraphrase: 0 });
});

test('言い換えは語彙モードと無関係で、材料のある語だけを数える・出す', () => {
  const words = [
    { id: 'a', vocabularyType: 'passive' as const },
    { id: 'b', vocabularyType: 'active' as const },
    { id: 'c', vocabularyType: null },
  ];
  const eligible = new Set(['a', 'b']);
  const options = { isParaphraseEligible: (word: { id: string }) => eligible.has(word.id) };
  assert.equal(matchesAnswerFormat(words[0], 'paraphrase', options), true);
  assert.equal(matchesAnswerFormat(words[1], 'paraphrase', options), true);
  assert.equal(matchesAnswerFormat(words[2], 'paraphrase', options), false);
  assert.deepEqual(filterWordsForAnswerFormat(words, 'paraphrase', options).map((w) => w.id), ['a', 'b']);
  assert.equal(countWordsByAnswerFormat(words, options).paraphrase, 2);
  // 四択・記述の数は言い換えの材料に左右されない
  assert.equal(countWordsByAnswerFormat(words, options).normal, 2);
  assert.equal(countWordsByAnswerFormat(words, options).typing, 1);
});

test('材料の判定を渡さなければ言い換えは 0 語 (材料が届く前の選択画面)', () => {
  assert.equal(matchesAnswerFormat(passive, 'paraphrase'), false);
  assert.equal(countWordsByAnswerFormat([active, passive]).paraphrase, 0);
});
