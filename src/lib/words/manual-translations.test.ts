import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MANUAL_TRANSLATION_INPUT_LIMIT,
  buildManualTranslations,
} from '@/lib/words/manual-translations';

test('buildManualTranslations: 何も入力されていなければ空', () => {
  assert.deepEqual(buildManualTranslations(['', '  ']), { japanese: '' });
});

test('buildManualTranslations: 訳が1つなら translations を付けない', () => {
  assert.deepEqual(buildManualTranslations(['', ' 美しい ']), { japanese: '美しい' });
});

test('buildManualTranslations: 複数の訳を入力順に user 由来の訳レコードにする', () => {
  const result = buildManualTranslations(['走る', '', '経営する']);
  assert.equal(result.japanese, '走る');
  assert.deepEqual(
    result.translations?.map((t) => [t.translationJa, t.source, t.meaningRank, t.position, t.isPrimary]),
    [
      ['走る', 'user', 1, 0, true],
      ['経営する', 'user', 2, 1, false],
    ],
  );
});

test('buildManualTranslations: 1つの欄の「；」区切りも分け、重複は落とす', () => {
  const result = buildManualTranslations(['美しい；きれいな', 'きれいな']);
  assert.deepEqual(result.translations?.map((t) => t.translationJa), ['美しい', 'きれいな']);
});

test('buildManualTranslations: 上限を超えた訳は切り捨てる', () => {
  const inputs = Array.from({ length: MANUAL_TRANSLATION_INPUT_LIMIT + 3 }, (_, i) => `訳${i}`);
  assert.equal(buildManualTranslations(inputs).translations?.length, MANUAL_TRANSLATION_INPUT_LIMIT);
});
