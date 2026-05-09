import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateQuizProgressPercentage,
  calculateQuizScorePercentage,
  getQuizCompletionMessage,
  parseQuizQuestionCountInput,
} from './quiz-progress';

test('getQuizCompletionMessage preserves percentage thresholds', () => {
  assert.equal(getQuizCompletionMessage(100), 'パーフェクト! 素晴らしい!');
  assert.equal(getQuizCompletionMessage(80), 'よくできました!');
  assert.equal(getQuizCompletionMessage(60), 'もう少し! 復習しましょう');
  assert.equal(getQuizCompletionMessage(59), '繰り返し練習しましょう!');
});

test('calculateQuizScorePercentage matches existing rounded correct / total percentage', () => {
  assert.equal(calculateQuizScorePercentage({ correct: 2, total: 3 }), Math.round((2 / 3) * 100));
  assert.equal(calculateQuizScorePercentage({ correct: 7, total: 9 }), Math.round((7 / 9) * 100));
});

test('calculateQuizProgressPercentage matches current index over question count', () => {
  assert.equal(calculateQuizProgressPercentage(0, 10), ((0 + 1) / 10) * 100);
  assert.equal(calculateQuizProgressPercentage(4, 10), ((4 + 1) / 10) * 100);
  assert.equal(calculateQuizProgressPercentage(9, 10), ((9 + 1) / 10) * 100);
});

test('parseQuizQuestionCountInput only validates inputCount within 1 to maxQuestions', () => {
  const maxQuestions = 20;

  assert.deepEqual(parseQuizQuestionCountInput('1', maxQuestions), {
    parsedInput: 1,
    isValidInput: true,
  });
  assert.deepEqual(parseQuizQuestionCountInput('20', maxQuestions), {
    parsedInput: 20,
    isValidInput: true,
  });
});

test('parseQuizQuestionCountInput rejects invalid, empty, zero, and over max input', () => {
  const maxQuestions = 20;

  assert.equal(parseQuizQuestionCountInput('abc', maxQuestions).isValidInput, false);
  assert.equal(parseQuizQuestionCountInput('', maxQuestions).isValidInput, false);
  assert.equal(parseQuizQuestionCountInput('0', maxQuestions).isValidInput, false);
  assert.equal(parseQuizQuestionCountInput('21', maxQuestions).isValidInput, false);
});
