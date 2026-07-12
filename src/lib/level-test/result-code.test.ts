import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVEL_TEST_QUESTION_COUNT,
  answerQuestion,
  buildResult,
  createInitialState,
  isFinished,
  probabilityOfCorrect,
  selectNextQuestion,
  usedKeyFor,
  type LevelTestResult,
} from './engine';
import type { LevelTestBank } from './bank';
import { decodeLevelTestResult, encodeLevelTestResult } from './result-code';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS_PER_LEVEL = 40;
const TEST_BANK: LevelTestBank = {
  version: 1,
  levels: Array.from({ length: 7 }, (_, levelIndex) =>
    Array.from({ length: WORDS_PER_LEVEL }, (_, wordIndex) => ({
      english: `word-${levelIndex}-${wordIndex}`,
      japanese: `訳${levelIndex}-${wordIndex}`,
      distractors: ['誤1', '誤2', '誤3'] as [string, string, string],
    }))),
};

// answerFor(i) が i問目の正誤を返す形で1回分の診断を実行する
function resultFromRun(answerFor: (index: number) => boolean, seed = 1): LevelTestResult {
  const random = seededRandom(seed);
  let state = createInitialState();
  const used = new Set<string>();
  let index = 0;
  while (!isFinished(state)) {
    const picked = selectNextQuestion(TEST_BANK, state, used, random);
    if (!picked) throw new Error('bank exhausted');
    used.add(usedKeyFor(picked.levelIndex, picked.wordIndex));
    state = answerQuestion(state, picked, TEST_BANK, answerFor(index) ? 'correct' : 'wrong');
    index += 1;
  }
  return buildResult(state);
}

// 真の能力θ=4.5相当の確率的な回答者
function abilityAnswerer(trueTheta: number, seed: number): (index: number) => boolean {
  const random = seededRandom(seed);
  return () => random() < probabilityOfCorrect(trueTheta, 4.5);
}

const PERFECT = resultFromRun(() => true);
const ALL_WRONG = resultFromRun(() => false);
const MIXED = resultFromRun((index) => index % 3 !== 2, 5);

test('encode/decode round-trips across edge payloads', () => {
  for (const result of [PERFECT, ALL_WRONG, MIXED]) {
    const code = encodeLevelTestResult(result);
    const decoded = decodeLevelTestResult(code);
    assert.ok(decoded, `decode failed for code ${code}`);
    assert.equal(decoded!.v, 2);
    assert.equal(decoded!.finalLevel, result.finalLevel);
    assert.equal(decoded!.clearedMax, result.clearedMax);
    assert.equal(decoded!.correctTotal, result.correctTotal);
    assert.deepEqual(decoded!.askedByLevel, result.askedByLevel);
    assert.deepEqual(decoded!.correctByLevel, result.correctByLevel);
    assert.equal(decoded!.confidence, result.confidence);
    // θは0.05刻みの量子化を挟むので誤差込みで一致
    assert.ok(Math.abs(decoded!.ability! - result.ability) <= 0.05);
    assert.ok(Math.abs(decoded!.lowerAbility! - result.lowerAbility) <= 0.05);
    assert.ok(Math.abs(decoded!.upperAbility! - result.upperAbility) <= 0.05);
    assert.ok(decoded!.lowerAbility! <= decoded!.ability!);
    assert.ok(decoded!.ability! <= decoded!.upperAbility!);
    assert.ok(decoded!.lowerLevel! <= decoded!.finalLevel);
    assert.ok(decoded!.finalLevel <= decoded!.upperLevel!);
  }
});

test('round-trips hold for many simulated ability levels (quantization boundaries)', () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const result = resultFromRun(abilityAnswerer(1 + (seed % 5), seed * 13 + 3), seed);
    const decoded = decodeLevelTestResult(encodeLevelTestResult(result));
    assert.ok(decoded, `decode failed for seed ${seed} (ability=${result.ability})`);
    assert.equal(decoded!.correctTotal, result.correctTotal);
  }
});

test('codes are URL-safe and compact', () => {
  const code = encodeLevelTestResult(MIXED);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.equal(code.length, 28);
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
});

// 階段型アルゴリズム時代(v1)の共有URLが引き続き表示できること。
// このコードは旧エンコーダで生成した固定値
// (finalLevel=5, maxLevel=6, clearedMax=false, correctTotal=14,
//  askedByLevel=[0,2,2,3,4,5,4], correctByLevel=[0,2,2,2,3,3,2])。
test('legacy v1 codes still decode (shared URLs stay valid)', () => {
  const v1Bytes = [
    1,
    (5 & 0x07) | ((6 & 0x07) << 3),
    14,
    0, 2, 2, 3, 4, 5, 4,
    0, 2, 2, 2, 3, 3, 2,
  ];
  let sum = 0;
  for (const byte of v1Bytes) sum = (sum + byte) & 0xff;
  v1Bytes.push(((sum * 31) + 7) & 0xff);

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let code = '';
  for (let i = 0; i < v1Bytes.length; i += 3) {
    const b0 = v1Bytes[i];
    const b1 = v1Bytes[i + 1];
    const b2 = v1Bytes[i + 2];
    code += alphabet[b0 >> 2];
    code += alphabet[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    code += alphabet[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    code += alphabet[b2 & 0x3f];
  }

  const decoded = decodeLevelTestResult(code);
  assert.ok(decoded, 'v1 code should decode');
  assert.equal(decoded!.v, 1);
  assert.equal(decoded!.finalLevel, 5);
  assert.equal(decoded!.maxLevel, 6);
  assert.equal(decoded!.clearedMax, false);
  assert.equal(decoded!.correctTotal, 14);
  assert.deepEqual(decoded!.askedByLevel, [0, 2, 2, 3, 4, 5, 4]);
  // v2で追加されたフィールドはv1には無い
  assert.equal(decoded!.ability, undefined);
  assert.equal(decoded!.confidence, undefined);
  assert.equal(LEVEL_TEST_QUESTION_COUNT, 20);
});
