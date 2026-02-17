import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeWithLocalFallback,
  selectImpactedExistingIds,
  toCacheRows,
} from './similar-cache';

const sourceWord = {
  id: 'source',
  english: 'happy',
  japanese: 'うれしい',
};

test('toCacheRows assigns rank from 1..3', () => {
  const rows = toCacheRows({
    userId: '11111111-1111-4111-8111-111111111111',
    sourceWordId: sourceWord.id,
    candidates: [
      { id: 'a', english: 'glad', japanese: 'うれしい', similarity: 0.9, source: 'vector' },
      { id: 'b', english: 'joyful', japanese: '喜ばしい', similarity: 0.8, source: 'vector' },
      { id: 'c', english: 'delighted', japanese: '大喜び', similarity: 0.7, source: 'local' },
    ],
    updatedAt: '2026-02-18T00:00:00.000Z',
  });

  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3]);
});

test('mergeWithLocalFallback removes duplicate vector ids', () => {
  const result = mergeWithLocalFallback({
    sourceWord,
    allUserWords: [
      sourceWord,
      { id: 'a', english: 'glad', japanese: 'うれしい 気持ち' },
      { id: 'b', english: 'joyful', japanese: '幸福な 気分' },
    ],
    vectorResults: [
      { id: 'a', english: 'glad', japanese: 'うれしい', similarity: 0.91, source: 'vector' },
      { id: 'a', english: 'glad', japanese: 'うれしい', similarity: 0.90, source: 'vector' },
      { id: 'b', english: 'joyful', japanese: '幸福な', similarity: 0.88, source: 'vector' },
    ],
    limit: 3,
  });

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.id), ['a', 'b']);
});

test('mergeWithLocalFallback fills from local similarity when vector is insufficient', () => {
  const result = mergeWithLocalFallback({
    sourceWord,
    allUserWords: [
      sourceWord,
      { id: 'a', english: 'glad', japanese: 'うれしい 気持ち' },
      { id: 'b', english: 'delighted', japanese: 'とても うれしい' },
      { id: 'c', english: 'table', japanese: '机' },
    ],
    vectorResults: [
      { id: 'a', english: 'glad', japanese: 'うれしい', similarity: 0.91, source: 'vector' },
    ],
    limit: 3,
  });

  assert.equal(result.length >= 2, true);
  assert.equal(result[0].id, 'a');
  assert.equal(result.some((item) => item.source === 'local'), true);
});

test('selectImpactedExistingIds enforces max cap and excludes new words', () => {
  const impactedIds = selectImpactedExistingIds({
    newWordIds: ['new-1', 'new-2'],
    nearbyIdsBySource: [
      ['new-1', 'x1', 'x2', 'x3'],
      ['new-2', 'x2', 'x4', 'x5'],
    ],
    maxImpacted: 3,
  });

  assert.equal(impactedIds.length, 3);
  assert.equal(impactedIds.includes('new-1'), false);
  assert.equal(impactedIds.includes('new-2'), false);
});

