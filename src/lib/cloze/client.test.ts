import test from 'node:test';
import assert from 'node:assert/strict';

import type { Word } from '@/types';
import {
  MAX_CLOZE_REQUEST_WORDS,
  attributionAuthor,
  pickClozeRequestWords,
  resolveClozeQuizCount,
  tatoebaSentenceUrl,
  toClozeWordInput,
} from './client';

function word(id: string, overrides: Partial<Word> = {}): Word {
  return {
    id,
    projectId: 'p1',
    english: `word${id}`,
    japanese: `訳${id}`,
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

test('count is clamped to 1–30 with a default of 10', () => {
  assert.equal(resolveClozeQuizCount(null), 10);
  assert.equal(resolveClozeQuizCount('abc'), 10);
  assert.equal(resolveClozeQuizCount('0'), 10);
  assert.equal(resolveClozeQuizCount('15'), 15);
  assert.equal(resolveClozeQuizCount('99'), 30);
});

test('only Passive (or unset) words are sent, like the multiple-choice quiz', () => {
  const picked = pickClozeRequestWords(
    [
      word('a', { vocabularyType: 'active' }),
      word('p', { vocabularyType: 'passive' }),
      word('n', { vocabularyType: null }),
    ],
    10,
  );
  assert.deepEqual(picked.map((w) => w.id).sort(), ['n', 'p']);
});

test('mastered words are dropped when others exist, and words without text are never sent', () => {
  const picked = pickClozeRequestWords(
    [word('m', { status: 'mastered' }), word('x'), word('empty', { japanese: ' ' })],
    10,
  );
  assert.deepEqual(picked.map((w) => w.id), ['x']);
});

test('twice the question count is requested, capped by the API limit', () => {
  const words = Array.from({ length: 100 }, (_, i) => word(String(i)));
  assert.equal(pickClozeRequestWords(words, 5).length, 10);
  assert.equal(pickClozeRequestWords(words, 30).length, MAX_CLOZE_REQUEST_WORDS);
});

test('non-uuid lexicon ids are not sent', () => {
  assert.equal(toClozeWordInput(word('1', { lexiconEntryId: 'local-123' })).lexiconEntryId, null);
  const uuid = '3f2c1a6e-8b7d-4c2e-9a1f-0d5e6b7c8a9b';
  assert.equal(toClozeWordInput(word('1', { lexiconEntryId: uuid })).lexiconEntryId, uuid);
});

test('attribution helpers', () => {
  assert.equal(tatoebaSentenceUrl(1276), 'https://tatoeba.org/ja/sentences/show/1276');
  assert.equal(attributionAuthor('CK'), 'CK (Tatoeba)');
  assert.equal(attributionAuthor(null), 'Tatoeba');
});
