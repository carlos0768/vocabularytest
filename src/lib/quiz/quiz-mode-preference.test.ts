import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUIZ_MODE_STORAGE_KEY,
  isQuizMode,
  readQuizMode,
  writeQuizMode,
  type QuizModeStorage,
} from './quiz-mode-preference';

function fakeStorage(initial: Record<string, string> = {}): QuizModeStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

/** 参照しただけで投げる localStorage (Safari のプライベートモード相当)。 */
const throwingStorage: QuizModeStorage = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
};

test('a device that has not chosen yet reads as null', () => {
  assert.equal(readQuizMode(fakeStorage()), null);
});

test('the chosen mode round-trips', () => {
  const storage = fakeStorage();

  writeQuizMode('voice', storage);
  assert.equal(readQuizMode(storage), 'voice');

  writeQuizMode('normal', storage);
  assert.equal(readQuizMode(storage), 'normal');
});

test('the mode is stored under the documented key', () => {
  const storage = fakeStorage();
  writeQuizMode('voice', storage);
  assert.equal(storage.data[QUIZ_MODE_STORAGE_KEY], 'voice');
});

test('a corrupt stored value falls back to unchosen rather than a guess', () => {
  // 壊れた値で勝手に既定へ倒すと、選び直す機会が無くなる。
  assert.equal(readQuizMode(fakeStorage({ [QUIZ_MODE_STORAGE_KEY]: 'sideways' })), null);
  assert.equal(readQuizMode(fakeStorage({ [QUIZ_MODE_STORAGE_KEY]: '' })), null);
});

test('unavailable storage is treated as unchosen, not as an error', () => {
  assert.equal(readQuizMode(null), null);
  assert.equal(readQuizMode(throwingStorage), null);
});

test('writing to unavailable storage does not throw', () => {
  assert.doesNotThrow(() => writeQuizMode('voice', null));
  assert.doesNotThrow(() => writeQuizMode('voice', throwingStorage));
});

test('isQuizMode accepts only the two modes', () => {
  assert.equal(isQuizMode('normal'), true);
  assert.equal(isQuizMode('voice'), true);
  for (const value of ['', 'Normal', null, undefined, 0, {}]) {
    assert.equal(isQuizMode(value), false);
  }
});
