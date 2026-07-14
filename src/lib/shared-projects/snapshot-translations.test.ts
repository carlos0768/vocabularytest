import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSnapshotTranslations,
  snapshotTranslationsFromWordTranslationRows,
  snapshotTranslationsToWordTranslations,
} from './snapshot-translations';

test('normalizeSnapshotTranslations keeps valid entries and drops junk', () => {
  const result = normalizeSnapshotTranslations([
    { translationJa: '走る', meaningRank: 1 },
    { translationJa: '経営する', meaningRank: 2, source: 'ai' },
    { translationJa: '   ' },
    { meaningRank: 3 },
    'not-an-object',
    null,
  ]);
  assert.deepEqual(result, [
    { translationJa: '走る', meaningRank: 1 },
    { translationJa: '経営する', meaningRank: 2, source: 'ai' },
  ]);
});

test('normalizeSnapshotTranslations returns undefined for empty or non-array input', () => {
  assert.equal(normalizeSnapshotTranslations(undefined), undefined);
  assert.equal(normalizeSnapshotTranslations(null), undefined);
  assert.equal(normalizeSnapshotTranslations('走る'), undefined);
  assert.equal(normalizeSnapshotTranslations([]), undefined);
  assert.equal(normalizeSnapshotTranslations([{ translationJa: '' }]), undefined);
});

test('snapshotTranslationsFromWordTranslationRows orders primary first then by rank', () => {
  const result = snapshotTranslationsFromWordTranslationRows([
    { translation_ja: '経営する', meaning_rank: 2, position: 1, is_primary: false, source: 'ai' },
    { translation_ja: '立候補する', meaning_rank: 3, position: 2, is_primary: false },
    { translation_ja: '走る', meaning_rank: 1, position: 0, is_primary: true, source: 'scan' },
  ]);
  assert.deepEqual(result, [
    { translationJa: '走る', meaningRank: 1, source: 'scan' },
    { translationJa: '経営する', meaningRank: 2, source: 'ai' },
    { translationJa: '立候補する', meaningRank: 3 },
  ]);
});

test('snapshotTranslationsFromWordTranslationRows handles missing or empty relation', () => {
  assert.equal(snapshotTranslationsFromWordTranslationRows(undefined), undefined);
  assert.equal(snapshotTranslationsFromWordTranslationRows([]), undefined);
  assert.equal(snapshotTranslationsFromWordTranslationRows([{ translation_ja: '  ' }]), undefined);
});

test('snapshotTranslationsToWordTranslations rebuilds domain objects with positions', () => {
  const result = snapshotTranslationsToWordTranslations([
    { translationJa: '走る', meaningRank: 1 },
    { translationJa: '経営する' },
  ]);
  assert.deepEqual(result, [
    {
      translationJa: '走る',
      normalizedTranslationJa: '走る',
      meaningRank: 1,
      position: 0,
      isPrimary: true,
    },
    {
      translationJa: '経営する',
      normalizedTranslationJa: '経営する',
      meaningRank: 2,
      position: 1,
      isPrimary: false,
    },
  ]);
});

test('snapshotTranslationsToWordTranslations returns undefined when empty', () => {
  assert.equal(snapshotTranslationsToWordTranslations(undefined), undefined);
  assert.equal(snapshotTranslationsToWordTranslations([]), undefined);
});
