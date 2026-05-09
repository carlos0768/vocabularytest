import test from 'node:test';
import assert from 'node:assert/strict';

import type { WordStatus, VocabularyType } from '@/types';
import {
  countProjectWordStats,
  getProjectPartOfSpeechLabel,
  isProjectWordFilterActive,
  selectAvailableProjectPartsOfSpeech,
  selectFilteredProjectWords,
  type ProjectPageWord,
  type ProjectWordSortOrder,
} from './project-page-selectors';

interface TestWord extends ProjectPageWord {
  id: string;
}

function word(
  id: string,
  {
    english = id,
    japanese = id,
    createdAt = '2026-05-01T00:00:00.000Z',
    status = 'new',
    isFavorite = false,
    vocabularyType = null,
    partOfSpeechTags,
  }: {
    english?: string;
    japanese?: string;
    createdAt?: string;
    status?: WordStatus;
    isFavorite?: boolean;
    vocabularyType?: VocabularyType | null;
    partOfSpeechTags?: string[];
  } = {},
): TestWord {
  return {
    id,
    english,
    japanese,
    createdAt,
    status,
    isFavorite,
    vocabularyType,
    partOfSpeechTags,
  };
}

function selectIds(
  words: readonly TestWord[],
  options: Partial<{
    searchText: string;
    bookmark: boolean;
    activeness: 'all' | 'active' | 'passive';
    partOfSpeech: string | null;
    sortOrder: ProjectWordSortOrder;
  }> = {},
): string[] {
  return selectFilteredProjectWords(words, {
    searchText: '',
    bookmark: false,
    activeness: 'all',
    partOfSpeech: null,
    sortOrder: 'createdAsc',
    ...options,
  }).map((item) => item.id);
}

test('countProjectWordStats counts mastered, review, new, and missing status words', () => {
  const stats = countProjectWordStats([
    { status: 'mastered' },
    { status: 'review' },
    { status: 'new' },
    {},
  ]);

  assert.deepEqual(stats, {
    total: 4,
    mastered: 1,
    learning: 1,
    unlearned: 2,
  });
});

test('isProjectWordFilterActive ignores search text and checks bookmark, activeness, and part of speech filters', () => {
  assert.equal(isProjectWordFilterActive({ bookmark: false, activeness: 'all', partOfSpeech: null }), false);
  assert.equal(isProjectWordFilterActive({ bookmark: true, activeness: 'all', partOfSpeech: null }), true);
  assert.equal(isProjectWordFilterActive({ bookmark: false, activeness: 'active', partOfSpeech: null }), true);
  assert.equal(isProjectWordFilterActive({ bookmark: false, activeness: 'all', partOfSpeech: 'noun' }), true);
});

test('selectFilteredProjectWords filters by English and Japanese search text', () => {
  const words = [
    word('apple', { english: 'Apple', japanese: 'りんご' }),
    word('study', { english: 'study', japanese: '勉強する' }),
    word('river', { english: 'river', japanese: '川' }),
  ];

  assert.deepEqual(selectIds(words, { searchText: 'app' }), ['apple']);
  assert.deepEqual(selectIds(words, { searchText: '勉強' }), ['study']);
});

test('selectFilteredProjectWords filters favorites', () => {
  const words = [
    word('favorite', { isFavorite: true }),
    word('normal', { isFavorite: false }),
  ];

  assert.deepEqual(selectIds(words, { bookmark: true }), ['favorite']);
});

test('selectFilteredProjectWords filters active and passive words', () => {
  const words = [
    word('active-word', { vocabularyType: 'active' }),
    word('passive-word', { vocabularyType: 'passive' }),
    word('unset-word', { vocabularyType: null }),
  ];

  assert.deepEqual(selectIds(words, { activeness: 'active' }), ['active-word']);
  assert.deepEqual(selectIds(words, { activeness: 'passive' }), ['passive-word']);
});

test('selectFilteredProjectWords filters by partOfSpeechTags using case-insensitive includes', () => {
  const words = [
    word('noun', { partOfSpeechTags: ['Noun'] }),
    word('phrasal', { partOfSpeechTags: ['phrasal_verb'] }),
    word('verb', { partOfSpeechTags: ['verb'] }),
  ];

  assert.deepEqual(selectIds(words, { partOfSpeech: 'noun' }), ['noun']);
  assert.deepEqual(selectIds(words, { partOfSpeech: 'verb' }), ['phrasal', 'verb']);
});

test('selectFilteredProjectWords sorts alphabetically with base sensitivity', () => {
  const words = [
    word('banana', { english: 'banana' }),
    word('Apple', { english: 'Apple' }),
    word('cherry', { english: 'cherry' }),
  ];

  assert.deepEqual(selectIds(words, { sortOrder: 'alphabetical' }), ['Apple', 'banana', 'cherry']);
});

test('selectFilteredProjectWords sorts by status ascending', () => {
  const words = [
    word('mastered', { status: 'mastered' }),
    word('missing', { status: undefined }),
    word('review', { status: 'review' }),
    word('new', { status: 'new' }),
  ];

  assert.deepEqual(selectIds(words, { sortOrder: 'statusAsc' }), ['missing', 'new', 'review', 'mastered']);
});

test('selectFilteredProjectWords sorts by createdAt ascending by default', () => {
  const words = [
    word('newest', { createdAt: '2026-05-03T00:00:00.000Z' }),
    word('oldest', { createdAt: '2026-05-01T00:00:00.000Z' }),
    word('middle', { createdAt: '2026-05-02T00:00:00.000Z' }),
  ];

  assert.deepEqual(selectIds(words, { sortOrder: 'createdAsc' }), ['oldest', 'middle', 'newest']);
});

test('selectAvailableProjectPartsOfSpeech trims, removes empty values, dedupes, and sorts', () => {
  const partsOfSpeech = selectAvailableProjectPartsOfSpeech([
    { partOfSpeechTags: [' noun ', '', 'verb'] },
    { partOfSpeechTags: ['adverb', 'noun', '  '] },
    {},
  ]);

  assert.deepEqual(partsOfSpeech, ['adverb', 'noun', 'verb']);
});

test('getProjectPartOfSpeechLabel returns existing mappings and fallback labels', () => {
  assert.equal(getProjectPartOfSpeechLabel(), null);
  assert.equal(getProjectPartOfSpeechLabel([]), null);
  assert.equal(getProjectPartOfSpeechLabel(['noun']), '名');
  assert.equal(getProjectPartOfSpeechLabel(['verb']), '動');
  assert.equal(getProjectPartOfSpeechLabel(['adjective']), '形');
  assert.equal(getProjectPartOfSpeechLabel(['adverb']), '副');
  assert.equal(getProjectPartOfSpeechLabel(['phrase']), '句');
  assert.equal(getProjectPartOfSpeechLabel(['idiom']), '熟');
  assert.equal(getProjectPartOfSpeechLabel(['phrasal_verb']), '句');
  assert.equal(getProjectPartOfSpeechLabel(['conjunction']), 'c');
});
