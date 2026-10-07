import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUIZ_MODE_CHOSEN_ON_STORAGE_KEY,
  QUIZ_MODE_STORAGE_KEY,
  quizModeDayKey,
  readTodaysQuizMode,
  isQuizAnswerFormat,
  isQuizMode,
  readQuizMode,
  writeQuizMode,
  type QuizModeStorage,
} from './quiz-mode-preference';
import { PARAPHRASE_FEATURE_ENABLED } from '@/lib/paraphrase/feature-flag';

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

  writeQuizMode('typing', storage);
  assert.equal(readQuizMode(storage), 'typing');

  // 言い換えは機能を止めている間は読めない (端末に残っていても選択画面に戻す)
  writeQuizMode('paraphrase', storage);
  assert.equal(readQuizMode(storage), PARAPHRASE_FEATURE_ENABLED ? 'paraphrase' : null);
});

test('言い換えはこの画面の中で解ける形式 (機能が有効なとき) で、音読は別ページ', () => {
  assert.equal(isQuizAnswerFormat('paraphrase'), PARAPHRASE_FEATURE_ENABLED);
  assert.equal(isQuizMode('paraphrase'), PARAPHRASE_FEATURE_ENABLED);
  assert.equal(isQuizAnswerFormat('voice'), false);
  assert.equal(isQuizMode('voice'), true);
  assert.equal(isQuizAnswerFormat('sideways'), false);
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

// 2026-09-28 10:00 JST
const MORNING = new Date('2026-09-28T01:00:00Z');
// 2026-09-28 23:59 JST
const LATE_NIGHT = new Date('2026-09-28T14:59:00Z');
// 2026-09-29 00:00 JST
const NEXT_DAY = new Date('2026-09-28T15:00:00Z');

test('the day key follows the JST calendar day, not UTC', () => {
  assert.equal(quizModeDayKey(MORNING), '2026-09-28');
  assert.equal(quizModeDayKey(LATE_NIGHT), '2026-09-28');
  assert.equal(quizModeDayKey(NEXT_DAY), '2026-09-29');
});

test('a mode chosen today is kept for the rest of the day', () => {
  const storage = fakeStorage();
  writeQuizMode('typing', storage, MORNING);
  assert.equal(storage.data[QUIZ_MODE_CHOSEN_ON_STORAGE_KEY], '2026-09-28');
  assert.equal(readTodaysQuizMode(storage, MORNING), 'typing');
  assert.equal(readTodaysQuizMode(storage, LATE_NIGHT), 'typing');
});

test('the next day asks again, but still preselects the last choice', () => {
  const storage = fakeStorage();
  writeQuizMode('voice', storage, LATE_NIGHT);
  assert.equal(readTodaysQuizMode(storage, NEXT_DAY), null);
  assert.equal(readQuizMode(storage), 'voice');
});

test('switching mid-day replaces the kept mode', () => {
  const storage = fakeStorage();
  writeQuizMode('normal', storage, MORNING);
  writeQuizMode('typing', storage, LATE_NIGHT);
  assert.equal(readTodaysQuizMode(storage, LATE_NIGHT), 'typing');
});

test('a mode saved before the day was recorded asks again', () => {
  // この機能より前に保存された値には日付が無い。今日選んだとは言えないので訊く。
  const storage = fakeStorage({ [QUIZ_MODE_STORAGE_KEY]: 'normal' });
  assert.equal(readTodaysQuizMode(storage, MORNING), null);
});

test('the separate-page cloze mode is kept for the day too', () => {
  const storage = fakeStorage();
  writeQuizMode('cloze', storage, MORNING);
  assert.equal(readTodaysQuizMode(storage, LATE_NIGHT), 'cloze');
});

test('unavailable storage never skips the chooser', () => {
  assert.equal(readTodaysQuizMode(null, MORNING), null);
  assert.equal(readTodaysQuizMode(throwingStorage, MORNING), null);
});

test('isQuizMode accepts only the four modes', () => {
  assert.equal(isQuizMode('normal'), true);
  assert.equal(isQuizMode('typing'), true);
  assert.equal(isQuizMode('voice'), true);
  assert.equal(isQuizMode('cloze'), true);
  for (const value of ['', 'Normal', null, undefined, 0, {}]) {
    assert.equal(isQuizMode(value), false);
  }
});

test('isQuizAnswerFormat excludes voice, which lives on its own page', () => {
  assert.equal(isQuizAnswerFormat('normal'), true);
  assert.equal(isQuizAnswerFormat('typing'), true);
  // 音読チャレンジは /voice-quiz なので、四択クイズ画面の形式としては受け付けない
  // ——受け付けると ?format=voice で音読を四択画面に描かせてしまう。
  assert.equal(isQuizAnswerFormat('voice'), false);
  // 空所補充も /cloze-quiz の別ページ
  assert.equal(isQuizAnswerFormat('cloze'), false);
  for (const value of ['', 'Typing', null, undefined, 0, {}]) {
    assert.equal(isQuizAnswerFormat(value), false);
  }
});
