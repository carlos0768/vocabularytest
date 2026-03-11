import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureSourceLabels,
  mergeSourceLabels,
  normalizeSourceLabel,
  normalizeSourceLabels,
} from './source-labels';

test('normalizeSourceLabel trims whitespace and canonicalizes note aliases', () => {
  assert.equal(normalizeSourceLabel('  note  '), 'ノート');
  assert.equal(normalizeSourceLabel(' 鉄壁 '), '鉄壁');
  assert.equal(normalizeSourceLabel('「LEAP」'), 'LEAP');
  assert.equal(normalizeSourceLabel('英語教材: 鉄壁'), '鉄壁');
  assert.equal(normalizeSourceLabel('   '), null);
});

test('normalizeSourceLabel rejects generic material labels', () => {
  assert.equal(normalizeSourceLabel('英語教材'), null);
  assert.equal(normalizeSourceLabel('参考書'), null);
  assert.equal(normalizeSourceLabel('textbook'), null);
});

test('normalizeSourceLabels deduplicates while preserving order', () => {
  assert.deepEqual(
    normalizeSourceLabels([' 鉄壁 ', 'note', 'ノート', 'LEAP', 'leap']),
    ['鉄壁', 'ノート', 'LEAP']
  );
});

test('mergeSourceLabels unions existing and incoming labels', () => {
  assert.deepEqual(
    mergeSourceLabels(['鉄壁', 'ノート'], ['LEAP', '鉄壁']),
    ['鉄壁', 'ノート', 'LEAP']
  );
});

test('ensureSourceLabels falls back to ノート when labels are empty', () => {
  assert.deepEqual(ensureSourceLabels([]), ['ノート']);
  assert.deepEqual(ensureSourceLabels(['英語教材', '参考書']), ['ノート']);
});
