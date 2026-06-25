import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeWordForTranslationPersistence } from './translation-persistence';

test('normalizeWordForTranslationPersistence keeps one word with multiple translations', () => {
  const word = normalizeWordForTranslationPersistence({
    english: 'sense',
    japanese: '感覚;分別',
    japaneseSource: 'scan' as const,
    distractors: [],
    translations: [
      { japanese: '感覚;分別', source: 'scan', meaningRank: 1 },
    ],
    partOfSpeechTags: ['noun'],
  });

  assert.equal(word.japanese, '感覚');
  assert.deepEqual(word.translations?.map((translation) => translation.translationJa), ['感覚', '分別']);
  assert.deepEqual(word.translations?.map((translation) => translation.isPrimary), [true, false]);
  assert.deepEqual(word.translations?.map((translation) => translation.position), [0, 1]);
});

test('normalizeWordForTranslationPersistence keeps explicit id words as one row for sync upserts', () => {
  const word = normalizeWordForTranslationPersistence({
    id: 'word-1',
    english: 'sense',
    japanese: '感覚;分別',
    japaneseSource: 'scan' as const,
    translations: [
      { japanese: '感覚;分別', source: 'scan', meaningRank: 1 },
    ],
  });

  assert.equal(word?.id, 'word-1');
  assert.equal(word?.japanese, '感覚');
  assert.deepEqual(word?.translations?.map((translation) => translation.translationJa), ['感覚', '分別']);
});
