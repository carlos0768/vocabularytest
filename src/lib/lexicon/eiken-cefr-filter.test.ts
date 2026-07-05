import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterWordsByLexiconCefrLevel,
  getEikenCefrThreshold,
} from '@/lib/lexicon/eiken-cefr-filter';
import type { CefrLevel } from '@/lib/reels/eiken-cefr';

test('getEikenCefrThreshold maps EIKEN grades to the easiest CEFR level of their band', () => {
  assert.equal(getEikenCefrThreshold('5'), 'A1');
  assert.equal(getEikenCefrThreshold('4'), 'A1');
  assert.equal(getEikenCefrThreshold('3'), 'A2');
  assert.equal(getEikenCefrThreshold('pre2'), 'A2');
  assert.equal(getEikenCefrThreshold('2'), 'B1');
  assert.equal(getEikenCefrThreshold('pre1'), 'B2');
  assert.equal(getEikenCefrThreshold('1'), 'C1');
  assert.equal(getEikenCefrThreshold('unknown'), null);
  assert.equal(getEikenCefrThreshold(null), null);
});

test('filterWordsByLexiconCefrLevel removes below-level words and lexicon-unknown words', async () => {
  const levels = new Map<string, CefrLevel>([
    ['pen', 'A1'],
    ['consider', 'B1'],
    ['abolish', 'B2'],
    ['hypothesis', 'C1'],
  ]);

  const words = [
    { english: 'pen' },
    { english: 'consider' },
    { english: 'abolish' },
    { english: 'hypothesis' },
    { english: 'zymurgy' },
  ];

  const result = await filterWordsByLexiconCefrLevel(words, 'pre1', {
    lookupCefrLevels: async () => levels,
  });

  // pen/consider はレベル未満、zymurgy はlexicon未登録(ゴミ文字列扱い)として除外
  assert.deepEqual(
    result.words.map((word) => word.english),
    ['abolish', 'hypothesis'],
  );
  assert.equal(result.removedCount, 2);
  assert.equal(result.unknownCount, 1);
});

test('filterWordsByLexiconCefrLevel normalizes headwords before lookup', async () => {
  const levels = new Map<string, CefrLevel>([['give up', 'A2']]);
  const seenKeys: string[][] = [];

  const result = await filterWordsByLexiconCefrLevel(
    [{ english: '  Give  Up ' }],
    'pre1',
    {
      lookupCefrLevels: async (keys) => {
        seenKeys.push(keys);
        return levels;
      },
    },
  );

  assert.deepEqual(seenKeys, [['give up']]);
  assert.equal(result.words.length, 0);
  assert.equal(result.removedCount, 1);
});

test('filterWordsByLexiconCefrLevel keeps all words when lookup fails (fail-open)', async () => {
  const words = [{ english: 'pen' }, { english: 'abolish' }];

  const result = await filterWordsByLexiconCefrLevel(words, 'pre1', {
    lookupCefrLevels: async () => {
      throw new Error('supabase unavailable');
    },
  });

  assert.deepEqual(result.words, words);
  assert.equal(result.removedCount, 0);
});

test('filterWordsByLexiconCefrLevel is a no-op for unknown levels', async () => {
  const words = [{ english: 'pen' }];

  const result = await filterWordsByLexiconCefrLevel(words, null, {
    lookupCefrLevels: async () => {
      throw new Error('should not be called');
    },
  });

  assert.deepEqual(result.words, words);
});
