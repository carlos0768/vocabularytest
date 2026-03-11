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
  assert.equal(normalizeSourceLabel('   '), null);
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
});
