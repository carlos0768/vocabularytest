import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DERIVED_WORDS_DATASET_META,
  resolveDerivedWordsEligibility,
} from './eligibility';

// 足切りの回帰テスト。dataset.json を再生成したら必ずここを通すこと
// (再生成手順は scripts/derived-words/README.md)。

test('dataset ships the precomputed verdicts', () => {
  assert.equal(DERIVED_WORDS_DATASET_META.version, 2);
  assert.equal(DERIVED_WORDS_DATASET_META.familyCount, 200);
  // 語彙上位56,675語のうち約19%が合格する。桁が変わったら生成が壊れている
  assert.ok(DERIVED_WORDS_DATASET_META.eligibleCount > 8000);
  assert.ok(DERIVED_WORDS_DATASET_META.eligibleCount < 15000);
});

test('rejects words with no derivational payoff', () => {
  // ユーザーが挙げた例。pine は接辞に分解できず派生も屈折のみ
  for (const word of ['pine', 'dog', 'cat', 'tree', 'run']) {
    const result = resolveDerivedWordsEligibility(word);
    assert.equal(result.eligible, false, `${word} should be rejected`);
    assert.deepEqual(result.tracks, []);
  }
});

test('rejects native words whose derivations are guessable', () => {
  // happiness → happy/happily, understand → understandable は
  // 「-ness/-ly/-able 程度で推測可」として落とす
  for (const word of ['happiness', 'beautiful', 'understand', 'yellow']) {
    assert.equal(resolveDerivedWordsEligibility(word).eligible, false, word);
  }
});

test('rejects words that are too rare to pay off', () => {
  for (const word of ['obfuscate', 'defenestrate']) {
    assert.equal(resolveDerivedWordsEligibility(word).eligible, false, word);
  }
});

test('accepts prefix-root words via track A with family context', () => {
  const result = resolveDerivedWordsEligibility('receive');
  assert.equal(result.eligible, true);
  assert.ok(result.tracks.includes('root-family'));
  assert.equal(result.tier, 'priority');
  assert.equal(result.prefix, 're');
  assert.equal(result.root, 'ceiv');
  // ラベルは異形態を「長さ→辞書順」で並べた正規形 (再生成しても不変)
  assert.equal(result.rootFamily?.label, 'ceiv/cept');
  assert.equal(result.rootFamily?.rank, 6);
  assert.ok(result.rootFamily!.words.includes('accept'));
});

test('accepts suffix-derivation words via track B', () => {
  // analyze は接頭辞を持たないので track A では落ちるが、
  // analysis/analytical を持つので track B で拾う
  const result = resolveDerivedWordsEligibility('analyze');
  assert.equal(result.eligible, true);
  assert.deepEqual(result.tracks, ['derivation']);
  assert.equal(result.rootFamily, null);
});

test('accepts words that pass both tracks', () => {
  const result = resolveDerivedWordsEligibility('decide');
  assert.equal(result.eligible, true);
  assert.deepEqual(result.tracks, ['root-family', 'derivation']);
});

test('covers core exam vocabulary the prefix track alone would miss', () => {
  for (const word of ['establish', 'identify', 'significant', 'economy', 'category']) {
    assert.equal(resolveDerivedWordsEligibility(word).eligible, true, word);
  }
});

test('normalizes case and whitespace', () => {
  assert.equal(resolveDerivedWordsEligibility('  ReCeIvE  ').eligible, true);
  assert.equal(resolveDerivedWordsEligibility('RECEIVE').headword, 'receive');
});

test('falls back through simple inflections', () => {
  // 活用形はデータセットに直接収録されている場合もあるが、
  // 未収録でも原形に戻して拾えること
  assert.equal(resolveDerivedWordsEligibility('receiving').eligible, true);
  assert.equal(resolveDerivedWordsEligibility('receives').eligible, true);
});

test('rejects non-alphabetic input without touching the dataset', () => {
  for (const word of ['', '   ', '走る', 'take off', '123', 'a1b2']) {
    assert.equal(resolveDerivedWordsEligibility(word).eligible, false, word);
  }
});
