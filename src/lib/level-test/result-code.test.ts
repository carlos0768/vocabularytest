import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVEL_TEST_QUESTION_COUNT,
  answerQuestion,
  buildResult,
  createInitialState,
  type LevelTestResult,
} from './engine';
import { decodeLevelTestResult, encodeLevelTestResult } from './result-code';

function resultFromRun(answers: boolean[]): LevelTestResult {
  let state = createInitialState();
  for (const correct of answers) {
    state = answerQuestion(state, correct).state;
  }
  return buildResult(state);
}

const PERFECT = resultFromRun(Array(LEVEL_TEST_QUESTION_COUNT).fill(true));
const ALL_WRONG = resultFromRun(Array(LEVEL_TEST_QUESTION_COUNT).fill(false));
const MIXED = resultFromRun([true, true, false, true, true, false, false, true, true, true,
  true, false, true, true, false, true, true, true, true, false]);

test('encode/decode round-trips across edge payloads', () => {
  for (const result of [PERFECT, ALL_WRONG, MIXED]) {
    const code = encodeLevelTestResult(result);
    const decoded = decodeLevelTestResult(code);
    assert.ok(decoded, `decode failed for code ${code}`);
    assert.equal(decoded!.finalLevel, result.finalLevel);
    assert.equal(decoded!.maxLevel, result.maxLevel);
    assert.equal(decoded!.clearedMax, result.clearedMax);
    assert.equal(decoded!.correctTotal, result.correctTotal);
    assert.deepEqual(decoded!.askedByLevel, result.askedByLevel);
    assert.deepEqual(decoded!.correctByLevel, result.correctByLevel);
  }
});

test('codes are URL-safe and compact', () => {
  const code = encodeLevelTestResult(MIXED);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.equal(code.length, 24);
});

test('tampered checksum decodes to null', () => {
  const code = encodeLevelTestResult(MIXED);
  const lastChar = code[code.length - 1];
  const replacement = lastChar === 'A' ? 'B' : 'A';
  assert.equal(decodeLevelTestResult(code.slice(0, -1) + replacement), null);
});

test('garbage input decodes to null instead of throwing', () => {
  assert.equal(decodeLevelTestResult(''), null);
  assert.equal(decodeLevelTestResult('!!!not-base64url!!!'), null);
  assert.equal(decodeLevelTestResult('あいうえお'), null);
  assert.equal(decodeLevelTestResult(encodeLevelTestResult(MIXED).slice(0, 10)), null);
  assert.equal(decodeLevelTestResult('A'.repeat(200)), null);
});

test('semantically invalid payloads decode to null', () => {
  // askedByLevel の合計が20でないコードを手作りする:
  // 正常なコードのバイトをいじるとチェックサムで落ちるので、
  // 不正な result を直接エンコードして検証が効くことを確かめる。
  const badResult: LevelTestResult = {
    ...MIXED,
    askedByLevel: [...MIXED.askedByLevel],
  };
  badResult.askedByLevel[0] += 1; // 合計が21になる
  assert.equal(decodeLevelTestResult(encodeLevelTestResult(badResult)), null);

  const inconsistentCorrect: LevelTestResult = {
    ...MIXED,
    correctTotal: MIXED.correctTotal + 1,
  };
  assert.equal(decodeLevelTestResult(encodeLevelTestResult(inconsistentCorrect)), null);

  const maxBelowFinal: LevelTestResult = { ...PERFECT, maxLevel: PERFECT.finalLevel - 1 };
  assert.equal(decodeLevelTestResult(encodeLevelTestResult(maxBelowFinal)), null);
});
