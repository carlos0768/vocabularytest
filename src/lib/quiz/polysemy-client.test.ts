import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word } from '@/types';
import {
  MAX_POLYSEMY_EXPANSION_WORDS,
  mergePolysemyTranslations,
  selectWordsForPolysemyExpansion,
} from './polysemy-client';

function createWord(overrides: Partial<Word> & Pick<Word, 'id' | 'english' | 'japanese'>): Word {
  return {
    projectId: 'project-1',
    distractors: [],
    status: 'new',
    createdAt: '2026-01-01T00:00:00.000Z',
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    ...overrides,
  };
}

test('only lexicon-linked words are sent for sense expansion', () => {
  const words = [
    createWord({ id: 'a', english: 'right', japanese: '右', lexiconEntryId: 'entry-1' }),
    createWord({ id: 'b', english: 'zzz', japanese: '謎' }),
    createWord({ id: 'c', english: 'run', japanese: '走る', lexiconEntryId: 'entry-2' }),
  ];

  assert.deepEqual(
    selectWordsForPolysemyExpansion(words).map((word) => word.id),
    ['a', 'c'],
  );
});

test('sense expansion is capped so a big review set stays one request batch set', () => {
  const words = Array.from({ length: 100 }, (_, index) => createWord({
    id: `word-${index}`,
    english: `word${index}`,
    japanese: `意味${index}`,
    lexiconEntryId: `entry-${index}`,
  }));

  assert.equal(selectWordsForPolysemyExpansion(words).length, MAX_POLYSEMY_EXPANSION_WORDS);
  assert.equal(selectWordsForPolysemyExpansion(words, 5).length, 5);
});

test('merging replaces translations only for the words the server answered for', () => {
  const words = [
    createWord({ id: 'a', english: 'right', japanese: '右', lexiconEntryId: 'entry-1' }),
    createWord({ id: 'b', english: 'run', japanese: '走る', lexiconEntryId: 'entry-2' }),
  ];

  const merged = mergePolysemyTranslations(words, [{
    wordId: 'a',
    translations: [
      { translationJa: '右', normalizedTranslationJa: '右', meaningRank: 1, position: 0, isPrimary: true },
      { translationJa: '権利', normalizedTranslationJa: '権利', meaningRank: 2, position: 1, isPrimary: false, distinctKey: '権利' },
    ],
  }]);

  assert.equal(merged[0].translations?.length, 2);
  assert.equal(merged[0].japanese, '右', 'the word own primary meaning is untouched');
  assert.equal(merged[1].translations, undefined);
  assert.deepEqual(mergePolysemyTranslations(words, []).map((word) => word.id), ['a', 'b']);
});

test('an empty translation list never wipes the local word', () => {
  const words = [createWord({
    id: 'a',
    english: 'right',
    japanese: '右',
    translations: [
      { translationJa: '右', normalizedTranslationJa: '右', meaningRank: 1, position: 0, isPrimary: true },
    ],
  })];

  const merged = mergePolysemyTranslations(words, [{ wordId: 'a', translations: [] }]);
  assert.equal(merged[0].translations?.length, 1);
});
