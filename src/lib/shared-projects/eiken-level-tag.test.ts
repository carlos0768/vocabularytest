import assert from 'node:assert/strict';
import test from 'node:test';

import type { CefrLevel } from '@/lib/reels/eiken-cefr';
import {
  computeEikenLevelTagForWords,
  estimateEikenLevelFromCefr,
  EIKEN_LEVEL_TAG_LABELS,
  isEikenLevelTag,
  mergeEikenLevelTag,
} from './eiken-level-tag';

test('estimateEikenLevelFromCefr maps easy books to 5級 and hard books to 1級', () => {
  assert.equal(estimateEikenLevelFromCefr(['A1', 'A1', 'A1']), '5');
  assert.equal(estimateEikenLevelFromCefr(['C1', 'C2', 'C1', 'C2']), '1');
});

test('estimateEikenLevelFromCefr picks intermediate grades from mixed levels', () => {
  assert.equal(estimateEikenLevelFromCefr(['A2', 'A2', 'A2']), '3');
  assert.equal(estimateEikenLevelFromCefr(['A2', 'B1', 'A2', 'B1']), 'pre2');
  assert.equal(estimateEikenLevelFromCefr(['B1', 'B1', 'B1']), '2');
  assert.equal(estimateEikenLevelFromCefr(['B2', 'B2', 'B2']), 'pre1');
});

test('estimateEikenLevelFromCefr resolves ties toward the harder grade', () => {
  // Mean index 0.25 sits exactly between 5級 (0) and 4級 (0.5).
  assert.equal(estimateEikenLevelFromCefr(['A1', 'A1', 'A1', 'A2']), '4');
});

test('estimateEikenLevelFromCefr needs a minimum sample of known levels', () => {
  assert.equal(estimateEikenLevelFromCefr([]), null);
  assert.equal(estimateEikenLevelFromCefr(['B1', 'B1']), null);
  assert.equal(estimateEikenLevelFromCefr(['??', 'B1', 'B1', 'B1']), '2');
});

test('isEikenLevelTag matches auto grade tags only', () => {
  assert.equal(isEikenLevelTag('英検準1級'), true);
  assert.equal(isEikenLevelTag('英検5級'), true);
  assert.equal(isEikenLevelTag('#英検2級'), true);
  assert.equal(isEikenLevelTag('英検'), false);
  assert.equal(isEikenLevelTag('TOEIC'), false);
  assert.equal(isEikenLevelTag('英検対策'), false);
});

test('mergeEikenLevelTag replaces stale grade tags and prepends the new one', () => {
  assert.deepEqual(
    mergeEikenLevelTag(['英検3級', 'TOEIC'], '英検準1級'),
    ['英検準1級', 'TOEIC'],
  );
  assert.deepEqual(mergeEikenLevelTag(['TOEIC'], null), ['TOEIC']);
  assert.deepEqual(mergeEikenLevelTag(['英検3級'], null), []);
});

test('computeEikenLevelTagForWords resolves levels via the lexicon lookup', async () => {
  const levels = new Map<string, CefrLevel>([
    ['apple', 'A1'],
    ['banana', 'A1'],
    ['cat', 'A1'],
  ]);

  const tag = await computeEikenLevelTagForWords(['Apple', 'banana', 'cat'], {
    lookupCefrLevels: async () => levels,
  });
  assert.equal(tag, EIKEN_LEVEL_TAG_LABELS['5']);
});

test('computeEikenLevelTagForWords returns null when too few words are known', async () => {
  const tag = await computeEikenLevelTagForWords(['xyzzy', 'quux', 'plugh'], {
    lookupCefrLevels: async () => new Map<string, CefrLevel>([['xyzzy', 'B1']]),
  });
  assert.equal(tag, null);

  assert.equal(await computeEikenLevelTagForWords([], {}), null);
});

test('computeEikenLevelTagForWords fails open when the lookup throws', async () => {
  const tag = await computeEikenLevelTagForWords(['apple', 'banana', 'cat'], {
    lookupCefrLevels: async () => {
      throw new Error('db down');
    },
  });
  assert.equal(tag, null);
});
