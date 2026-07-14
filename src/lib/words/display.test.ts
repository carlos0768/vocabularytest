import assert from 'node:assert/strict';
import test from 'node:test';

import { splitJapaneseTranslations } from '../../../shared/word-translations';
import { formatJapaneseForDisplay, getDisplayTranslations } from './display';

test('splitJapaneseTranslations splits numbered meanings even without whitespace before markers', () => {
  assert.deepEqual(splitJapaneseTranslations('1.走る2.経営する'), ['走る', '経営する']);
  assert.deepEqual(splitJapaneseTranslations('①走る②経営する'), ['走る', '経営する']);
  assert.deepEqual(splitJapaneseTranslations('1.走る 2.経営する'), ['走る', '経営する']);
  assert.deepEqual(splitJapaneseTranslations('走る；経営する'), ['走る', '経営する']);
});

test('splitJapaneseTranslations leaves ordinary text untouched', () => {
  assert.deepEqual(splitJapaneseTranslations('走る'), ['走る']);
  assert.deepEqual(splitJapaneseTranslations('料金は3.5ドル'), ['料金は3.5ドル']);
  assert.deepEqual(splitJapaneseTranslations('第2の意味'), ['第2の意味']);
  assert.deepEqual(
    splitJapaneseTranslations('(手紙・小包などを)発送する、順応する'),
    ['(手紙・小包などを)発送する、順応する'],
  );
});

test('getDisplayTranslations expands a legacy merged translation string into items', () => {
  const items = getDisplayTranslations({
    japanese: '1.走る2.経営する',
    translations: [{
      translationJa: '1.走る2.経営する',
      normalizedTranslationJa: '1.走る2.経営する',
      meaningRank: 1,
      position: 0,
      isPrimary: true,
    }],
  });
  assert.deepEqual(items.map((item) => item.text), ['走る', '経営する']);
  assert.deepEqual(items.map((item) => item.label), ['1.', '2.']);
});

test('getDisplayTranslations keeps separately stored translations as-is', () => {
  const items = getDisplayTranslations({
    japanese: '走る',
    translations: [
      { translationJa: '走る', normalizedTranslationJa: '走る', meaningRank: 1, position: 0, isPrimary: true },
      { translationJa: '経営する', normalizedTranslationJa: '経営する', meaningRank: 2, position: 1, isPrimary: false },
    ],
  });
  assert.deepEqual(items.map((item) => item.text), ['走る', '経営する']);
  assert.equal(items[0].isPrimary, true);
});

test('formatJapaneseForDisplay separates every meaning with a space', () => {
  assert.equal(
    formatJapaneseForDisplay({ japanese: '1.走る2.経営する', translations: [] }),
    '1.走る 2.経営する',
  );
});
