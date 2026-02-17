import assert from 'node:assert/strict';
import test from 'node:test';
import { findLocalSimilarWords } from './local-similar-words';

const source = {
  id: 'source-word',
  english: 'happy',
  japanese: '嬉しい 気分',
};

test('findLocalSimilarWords excludes source and returns best matches first', () => {
  const words = [
    source,
    { id: 'w-1', english: 'joyful', japanese: '嬉しい 気持ち' },
    { id: 'w-2', english: 'delighted', japanese: 'とても 嬉しい' },
    { id: 'w-3', english: 'table', japanese: '机' },
  ];

  const result = findLocalSimilarWords(source, words, { limit: 2 });

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'w-1');
  assert.equal(result[1].id, 'w-2');
});

test('findLocalSimilarWords respects excludeIds and removes text duplicates', () => {
  const words = [
    { id: 'w-1', english: 'joyful', japanese: '嬉しい 気持ち' },
    { id: 'w-2', english: 'joyful', japanese: '嬉しい 気持ち' },
    { id: 'w-3', english: 'happy', japanese: '幸福な' },
  ];

  const result = findLocalSimilarWords(source, words, {
    limit: 3,
    excludeIds: ['w-1'],
  });

  assert.equal(result.some((candidate) => candidate.id === 'w-1'), false);
  assert.equal(result.filter((candidate) => candidate.english === 'joyful').length, 1);
});

test('findLocalSimilarWords returns empty when nothing meets minScore', () => {
  const words = [
    { id: 'w-1', english: 'table', japanese: '机' },
    { id: 'w-2', english: 'clock', japanese: '時計' },
  ];

  const result = findLocalSimilarWords(source, words, { minScore: 0.2 });
  assert.equal(result.length, 0);
});
