import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isJapaneseAnswerCorrect,
  japaneseAnswerCandidates,
  normalizeJapaneseAnswer,
} from './voice-quiz-answer';

test('normalizeJapaneseAnswer folds katakana, width and punctuation', () => {
  assert.equal(normalizeJapaneseAnswer('コーヒー'), normalizeJapaneseAnswer('こーひー'));
  assert.equal(normalizeJapaneseAnswer('気づく。'), '気づく');
  assert.equal(normalizeJapaneseAnswer(' 気 づく '), '気づく');
  assert.equal(normalizeJapaneseAnswer('ＡＢＣ'), 'abc');
});

test('exact meaning is accepted', () => {
  assert.equal(isJapaneseAnswerCorrect('気づく', '気づく'), true);
});

test('trailing punctuation from speech recognition does not fail the answer', () => {
  assert.equal(isJapaneseAnswerCorrect('気づく。', '気づく'), true);
  assert.equal(isJapaneseAnswerCorrect('「気づく」', '気づく'), true);
});

test('any one of several registered meanings is accepted', () => {
  assert.equal(isJapaneseAnswerCorrect('認識する', '気づく、認識する'), true);
  assert.equal(isJapaneseAnswerCorrect('気づく', '気づく、認識する'), true);
});

test('meanings separated by a slash are split too', () => {
  assert.equal(isJapaneseAnswerCorrect('はっきりさせる', '明確にする／はっきりさせる'), true);
});

test('answering the core of a longer meaning is accepted', () => {
  assert.equal(isJapaneseAnswerCorrect('作り上げる', '入念に作り上げる'), true);
});

test('a parenthetical note may be omitted', () => {
  assert.equal(isJapaneseAnswerCorrect('与える', '(人に)与える'), true);
  assert.equal(isJapaneseAnswerCorrect('人に与える', '(人に)与える'), true);
});

test('katakana meanings match however they are transcribed', () => {
  assert.equal(isJapaneseAnswerCorrect('コーヒー', 'こーひー'), true);
});

test('a wrong meaning is rejected', () => {
  assert.equal(isJapaneseAnswerCorrect('走る', '気づく'), false);
});

test('a bare stray fragment is rejected', () => {
  // 「する」だけで「勉強する」を正解にしない。
  assert.equal(isJapaneseAnswerCorrect('る', '勉強する'), false);
});

test('empty or silent input is rejected', () => {
  assert.equal(isJapaneseAnswerCorrect('', '気づく'), false);
  assert.equal(isJapaneseAnswerCorrect('  ', '気づく'), false);
});

test('japaneseAnswerCandidates splits and folds every meaning', () => {
  const candidates = japaneseAnswerCandidates('気づく、認識する');
  assert.equal(candidates.length, 2);
  assert.ok(candidates.includes('気づく'));
  assert.ok(candidates.includes('認識する'));
});
