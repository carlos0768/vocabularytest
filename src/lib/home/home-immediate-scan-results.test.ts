import test from 'node:test';
import assert from 'node:assert/strict';

import type { LexiconEntry } from '@/types';
import {
  addHomeImmediateScanResult,
  buildHomeImmediateScanConfirmResultPayload,
  createHomeImmediateScanResultAccumulator,
  hasNoHomeImmediateScanWords,
} from './home-immediate-scan-results';

const firstLexiconEntry: LexiconEntry = {
  id: 'lexicon-1',
  headword: 'take off',
  normalizedHeadword: 'take off',
  pos: 'phrasal_verb',
  datasetSources: ['scan'],
  translationJa: '離陸する',
  translationSource: 'scan',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
};

const updatedFirstLexiconEntry: LexiconEntry = {
  ...firstLexiconEntry,
  translationJa: '脱ぐ',
};

const secondLexiconEntry: LexiconEntry = {
  id: 'lexicon-2',
  headword: 'accurate',
  normalizedHeadword: 'accurate',
  pos: 'adjective',
  datasetSources: ['scan'],
  translationJa: '正確な',
  translationSource: 'scan',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
};

test('addHomeImmediateScanResult accumulates first and second words in order', () => {
  let accumulator = createHomeImmediateScanResultAccumulator();

  accumulator = addHomeImmediateScanResult(accumulator, {
    words: [{ english: 'first' }],
  });
  accumulator = addHomeImmediateScanResult(accumulator, {
    words: [{ english: 'second' }, { english: 'third' }],
  });

  assert.deepEqual(accumulator.words, [
    { english: 'first' },
    { english: 'second' },
    { english: 'third' },
  ]);
});

test('addHomeImmediateScanResult merges sourceLabels with existing normalization and dedupe behavior', () => {
  let accumulator = createHomeImmediateScanResultAccumulator();

  accumulator = addHomeImmediateScanResult(accumulator, {
    sourceLabels: ['「Target 1900」', '教材', 'ノート'],
  });
  accumulator = addHomeImmediateScanResult(accumulator, {
    sourceLabels: ['target 1900', '速読英単語'],
  });

  assert.deepEqual(accumulator.sourceLabels, ['Target 1900', 'ノート', '速読英単語']);
});

test('addHomeImmediateScanResult merges lexiconEntries with existing last-entry-wins behavior', () => {
  let accumulator = createHomeImmediateScanResultAccumulator();

  accumulator = addHomeImmediateScanResult(accumulator, {
    lexiconEntries: [firstLexiconEntry],
  });
  accumulator = addHomeImmediateScanResult(accumulator, {
    lexiconEntries: [updatedFirstLexiconEntry, secondLexiconEntry],
  });

  assert.deepEqual(accumulator.lexiconEntries, [updatedFirstLexiconEntry, secondLexiconEntry]);
});

test('hasNoHomeImmediateScanWords detects an empty accumulator', () => {
  const emptyAccumulator = createHomeImmediateScanResultAccumulator();
  const filledAccumulator = addHomeImmediateScanResult(emptyAccumulator, {
    words: [{ english: 'word' }],
  });

  assert.equal(hasNoHomeImmediateScanWords(emptyAccumulator), true);
  assert.equal(hasNoHomeImmediateScanWords(filledAccumulator), false);
});

test('buildHomeImmediateScanConfirmResultPayload keeps the saveScanConfirmResultPayload shape', () => {
  const accumulator = addHomeImmediateScanResult(createHomeImmediateScanResultAccumulator(), {
    words: [{ english: 'accurate', japanese: '正確な' }],
    sourceLabels: ['Target 1900'],
    lexiconEntries: [secondLexiconEntry],
  });

  assert.deepEqual(buildHomeImmediateScanConfirmResultPayload(accumulator), {
    words: [{ english: 'accurate', japanese: '正確な' }],
    sourceLabels: ['Target 1900'],
    lexiconEntries: [secondLexiconEntry],
  });
});
