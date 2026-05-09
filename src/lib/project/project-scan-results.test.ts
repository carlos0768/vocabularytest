import test from 'node:test';
import assert from 'node:assert/strict';

import type { LexiconEntry } from '@/types';
import {
  addProjectScanResult,
  buildProjectScanConfirmResultPayload,
  createProjectScanResultAccumulator,
  hasNoProjectScanWords,
} from './project-scan-results';

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

test('addProjectScanResult accumulates first and second words in order', () => {
  let accumulator = createProjectScanResultAccumulator();

  accumulator = addProjectScanResult(accumulator, {
    words: [{ english: 'first' }],
  });
  accumulator = addProjectScanResult(accumulator, {
    words: [{ english: 'second' }, { english: 'third' }],
  });

  assert.deepEqual(accumulator.words, [
    { english: 'first' },
    { english: 'second' },
    { english: 'third' },
  ]);
});

test('addProjectScanResult merges sourceLabels with existing normalization and dedupe behavior', () => {
  let accumulator = createProjectScanResultAccumulator();

  accumulator = addProjectScanResult(accumulator, {
    sourceLabels: ['「Target 1900」', '教材', 'ノート'],
  });
  accumulator = addProjectScanResult(accumulator, {
    sourceLabels: ['target 1900', '速読英単語'],
  });

  assert.deepEqual(accumulator.sourceLabels, ['Target 1900', 'ノート', '速読英単語']);
});

test('addProjectScanResult merges lexiconEntries with existing last-entry-wins behavior', () => {
  let accumulator = createProjectScanResultAccumulator();

  accumulator = addProjectScanResult(accumulator, {
    lexiconEntries: [firstLexiconEntry],
  });
  accumulator = addProjectScanResult(accumulator, {
    lexiconEntries: [updatedFirstLexiconEntry, secondLexiconEntry],
  });

  assert.deepEqual(accumulator.lexiconEntries, [updatedFirstLexiconEntry, secondLexiconEntry]);
});

test('hasNoProjectScanWords detects an empty accumulator', () => {
  const emptyAccumulator = createProjectScanResultAccumulator();
  const filledAccumulator = addProjectScanResult(emptyAccumulator, {
    words: [{ english: 'word' }],
  });

  assert.equal(hasNoProjectScanWords(emptyAccumulator), true);
  assert.equal(hasNoProjectScanWords(filledAccumulator), false);
});

test('buildProjectScanConfirmResultPayload keeps the saveScanConfirmResultPayload shape', () => {
  const accumulator = addProjectScanResult(createProjectScanResultAccumulator(), {
    words: [{ english: 'accurate', japanese: '正確な' }],
    sourceLabels: ['Target 1900'],
    lexiconEntries: [secondLexiconEntry],
  });

  assert.deepEqual(buildProjectScanConfirmResultPayload(accumulator), {
    words: [{ english: 'accurate', japanese: '正確な' }],
    sourceLabels: ['Target 1900'],
    lexiconEntries: [secondLexiconEntry],
  });
});
