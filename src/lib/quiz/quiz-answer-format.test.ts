import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUIZ_ANSWER_FORMAT_STORAGE_KEY,
  isQuizAnswerFormat,
  readLastQuizAnswerFormat,
  shouldAnswerByTyping,
  writeLastQuizAnswerFormat,
  type QuizAnswerFormatStorage,
} from './quiz-answer-format';

function fakeStorage(initial: Record<string, string> = {}): QuizAnswerFormatStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

/** 参照しただけで投げる localStorage (Safari のプライベートモード相当)。 */
const throwingStorage: QuizAnswerFormatStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
};

test('isQuizAnswerFormat accepts only the two formats', () => {
  assert.equal(isQuizAnswerFormat('choice'), true);
  assert.equal(isQuizAnswerFormat('typing'), true);
  assert.equal(isQuizAnswerFormat('voice'), false);
  assert.equal(isQuizAnswerFormat(null), false);
});

test('the last choice round-trips through storage', () => {
  const storage = fakeStorage();
  writeLastQuizAnswerFormat('typing', storage);
  assert.equal(readLastQuizAnswerFormat(storage), 'typing');

  writeLastQuizAnswerFormat('choice', storage);
  assert.equal(readLastQuizAnswerFormat(storage), 'choice');
  assert.equal(storage.data[QUIZ_ANSWER_FORMAT_STORAGE_KEY], 'choice');
});

test('a device with nothing stored, a broken value, or no storage reads as null', () => {
  assert.equal(readLastQuizAnswerFormat(fakeStorage()), null);
  assert.equal(readLastQuizAnswerFormat(fakeStorage({ [QUIZ_ANSWER_FORMAT_STORAGE_KEY]: 'sideways' })), null);
  assert.equal(readLastQuizAnswerFormat(null), null);
  assert.equal(readLastQuizAnswerFormat(throwingStorage), null);
});

test('a storage that throws never breaks the write', () => {
  assert.doesNotThrow(() => writeLastQuizAnswerFormat('typing', throwingStorage));
  assert.doesNotThrow(() => writeLastQuizAnswerFormat('typing', null));
});

test('the chosen format decides every question, whatever the word is', () => {
  // 入力を選べば、四択向きの単語 (受信語彙) も入力で解かせる。
  assert.equal(shouldAnswerByTyping('typing', { isWordOrder: false, prefersTypeIn: false }), true);
  // 四択を選べば、発信語彙 (これまで入力だった単語) も四択で解かせる。
  assert.equal(shouldAnswerByTyping('choice', { isWordOrder: false, prefersTypeIn: true }), false);
});

test('word-order questions stay word-order under either format', () => {
  assert.equal(shouldAnswerByTyping('typing', { isWordOrder: true, prefersTypeIn: true }), false);
  assert.equal(shouldAnswerByTyping('choice', { isWordOrder: true, prefersTypeIn: false }), false);
});

test('a restored quiz with no format falls back to the per-word rule', () => {
  assert.equal(shouldAnswerByTyping(null, { isWordOrder: false, prefersTypeIn: true }), true);
  assert.equal(shouldAnswerByTyping(null, { isWordOrder: false, prefersTypeIn: false }), false);
});
