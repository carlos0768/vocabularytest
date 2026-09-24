import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HANDLE_PATTERN,
  buildHandleCandidates,
  romanizeKana,
  toHandleSeed,
} from './handle-suggestions';

/** Deterministic stand-in for Math.random. */
function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

test('romanizeKana handles hiragana, katakana, youon and sokuon', () => {
  assert.equal(romanizeKana('たろう'), 'tarou');
  assert.equal(romanizeKana('ケンタ'), 'kenta');
  assert.equal(romanizeKana('しゃちょう'), 'shachou');
  assert.equal(romanizeKana('きゃっと'), 'kyatto');
  assert.equal(romanizeKana('じゅん'), 'jun');
  assert.equal(romanizeKana('コーヒー'), 'kohi');
});

test('toHandleSeed builds a usable seed from a kana name', () => {
  assert.equal(toHandleSeed('ヤマダ タロウ'), 'yamadatarou');
  assert.equal(toHandleSeed('Kenta Suzuki'), 'kentasuzuki');
  assert.equal(toHandleSeed('  Ken-Ta  '), 'kenta');
});

test('toHandleSeed returns empty when nothing usable remains', () => {
  assert.equal(toHandleSeed('山田太郎'), '');
  assert.equal(toHandleSeed(''), '');
  assert.equal(toHandleSeed('a'), '');
});

test('toHandleSeed truncates to the handle length limit without a trailing underscore', () => {
  const seed = toHandleSeed('abcdefghijklmnopqrs_tuv');
  assert.equal(seed, 'abcdefghijklmnopqrs');
  assert.ok(HANDLE_PATTERN.test(seed));
});

test('buildHandleCandidates leads with the name-derived handle', () => {
  const candidates = buildHandleCandidates({
    displayName: 'ケンタ',
    count: 3,
    random: sequenceRandom([0.1, 0.4, 0.7]),
  });

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0], 'kenta');
  assert.ok(candidates.every((candidate) => HANDLE_PATTERN.test(candidate)));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('buildHandleCandidates prefers the typed handle over the display name as a seed', () => {
  const candidates = buildHandleCandidates({
    displayName: 'ケンタ',
    handle: 'mikan',
    count: 2,
    random: sequenceRandom([0.2]),
  });

  assert.equal(candidates[0], 'mikan');
});

test('buildHandleCandidates still fills the list for a kanji-only name', () => {
  const candidates = buildHandleCandidates({
    displayName: '山田太郎',
    count: 4,
    random: sequenceRandom([0.05, 0.35, 0.65, 0.95]),
  });

  assert.equal(candidates.length, 4);
  assert.ok(candidates.every((candidate) => HANDLE_PATTERN.test(candidate)));
  assert.equal(new Set(candidates).size, candidates.length);
});

test('buildHandleCandidates keeps every candidate within the length limit', () => {
  const candidates = buildHandleCandidates({
    displayName: 'abcdefghijklmnopqrst',
    count: 5,
    random: sequenceRandom([0.9, 0.1, 0.5]),
  });

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => HANDLE_PATTERN.test(candidate)));
});

test('buildHandleCandidates terminates on a degenerate random source', () => {
  const candidates = buildHandleCandidates({
    count: 5,
    random: () => 0,
  });

  assert.ok(candidates.length >= 1);
  assert.ok(candidates.every((candidate) => HANDLE_PATTERN.test(candidate)));
});
