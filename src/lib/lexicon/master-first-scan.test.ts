import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveImmediateWordsWithMasterFirst } from './master-first-scan';

const MASTER_ENTRY = {
  id: '11111111-1111-4111-8111-111111111111',
  headword: 'experiment',
  normalizedHeadword: 'experiment',
  pos: 'noun',
  cefrLevel: 'B1',
  datasetSources: ['runtime'],
  translationJa: '実験',
  translationSource: 'ai',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

test('resolveImmediateWordsWithMasterFirst fills blank japanese from master without AI translation', async () => {
  let batchTranslationCalls = 0;

  const result = await resolveImmediateWordsWithMasterFirst(
    [
      {
        english: 'experiment',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    {
      lookupEntries: async () => [MASTER_ENTRY],
      translateWords: async () => {
        batchTranslationCalls += 1;
        return new Map();
      },
    },
  );

  assert.equal(result.words[0]?.japanese, '実験');
  assert.equal(result.words[0]?.japaneseSource, undefined);
  assert.equal(result.words[0]?.lexiconEntryId, MASTER_ENTRY.id);
  assert.equal(result.words[0]?.cefrLevel, 'B1');
  assert.equal(batchTranslationCalls, 0);
  assert.equal(result.metrics.masterHitCount, 1);
  assert.equal(result.metrics.masterTranslationHitCount, 1);
  assert.equal(result.metrics.aiMissCount, 0);
});

test('resolveImmediateWordsWithMasterFirst preserves source-visible japanese while linking master entry', async () => {
  const result = await resolveImmediateWordsWithMasterFirst(
    [
      {
        english: 'experiment',
        japanese: '試験',
        japaneseSource: 'scan',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    {
      lookupEntries: async () => [MASTER_ENTRY],
      translateWords: async () => {
        throw new Error('translateWords should not run');
      },
      translateWord: async () => {
        throw new Error('translateWord should not run');
      },
    },
  );

  assert.equal(result.words[0]?.japanese, '試験');
  assert.equal(result.words[0]?.japaneseSource, 'scan');
  assert.equal(result.words[0]?.lexiconEntryId, MASTER_ENTRY.id);
  assert.equal(result.metrics.masterHitCount, 1);
  assert.equal(result.metrics.masterTranslationHitCount, 0);
  assert.equal(result.metrics.aiMissCount, 0);
});

test('resolveImmediateWordsWithMasterFirst AI-translates only unresolved misses after master lookup', async () => {
  let batchTranslationCalls = 0;
  let singleTranslationCalls = 0;

  const existingWithoutTranslation = {
    ...MASTER_ENTRY,
    id: '22222222-2222-4222-8222-222222222222',
    headword: 'beeline',
    normalizedHeadword: 'beeline',
    translationJa: undefined,
    translationSource: undefined,
  };

  const result = await resolveImmediateWordsWithMasterFirst(
    [
      {
        english: 'beeline',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
      {
        english: 'springboard',
        japanese: '',
        distractors: [],
        partOfSpeechTags: ['noun'],
      },
    ],
    {
      lookupEntries: async () => [existingWithoutTranslation],
      translateWords: async (inputs) => {
        batchTranslationCalls += 1;
        const map = new Map<string, string | null>();
        for (const input of inputs) {
          map.set(
            `${input.english.toLowerCase()}::${input.pos}`,
            input.english === 'beeline' ? '一直線' : null,
          );
        }
        return map;
      },
      translateWord: async (english) => {
        singleTranslationCalls += 1;
        return english === 'springboard' ? '出発点' : null;
      },
    },
  );

  assert.equal(batchTranslationCalls, 1);
  assert.equal(singleTranslationCalls, 1);
  assert.equal(result.words[0]?.japanese, '一直線');
  assert.equal(result.words[0]?.japaneseSource, 'ai');
  assert.equal(result.words[0]?.lexiconEntryId, existingWithoutTranslation.id);
  assert.equal(result.words[1]?.japanese, '出発点');
  assert.equal(result.words[1]?.japaneseSource, 'ai');
  assert.equal(result.words[1]?.lexiconEntryId, undefined);
  assert.equal(result.metrics.masterHitCount, 1);
  assert.equal(result.metrics.masterTranslationHitCount, 0);
  assert.equal(result.metrics.aiMissCount, 2);
});
