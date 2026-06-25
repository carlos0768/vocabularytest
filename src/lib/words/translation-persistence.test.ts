import assert from 'node:assert/strict';
import test from 'node:test';

import { expandWordsByTranslationsForPersistence } from './translation-persistence';

test('expandWordsByTranslationsForPersistence creates one persisted word per translation', () => {
  const words = expandWordsByTranslationsForPersistence([
    {
      english: 'sense',
      japanese: '感覚;分別',
      japaneseSource: 'scan' as const,
      distractors: [],
      translations: [
        { japanese: '感覚;分別', source: 'scan', meaningRank: 1 },
      ],
      partOfSpeechTags: ['noun'],
    },
  ]);

  assert.equal(words.length, 2);
  assert.deepEqual(words.map((word) => word.japanese), ['感覚', '分別']);
  assert.deepEqual(words.map((word) => word.translations?.[0]?.translationJa), ['感覚', '分別']);
  assert.deepEqual(words.map((word) => word.translations?.[0]?.isPrimary), [true, true]);
  assert.deepEqual(words.map((word) => word.translations?.[0]?.position), [0, 0]);
});

test('expandWordsByTranslationsForPersistence keeps explicit id words as one row for sync upserts', () => {
  const [word] = expandWordsByTranslationsForPersistence([
    {
      id: 'word-1',
      english: 'sense',
      japanese: '感覚;分別',
      japaneseSource: 'scan' as const,
      translations: [
        { japanese: '感覚;分別', source: 'scan', meaningRank: 1 },
      ],
    },
  ]);

  assert.equal(word?.id, 'word-1');
  assert.equal(word?.japanese, '感覚');
  assert.deepEqual(word?.translations?.map((translation) => translation.translationJa), ['感覚', '分別']);
});
