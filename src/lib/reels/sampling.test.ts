import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReelBook, ReelCandidate } from './types';
import {
  sampleBookWords,
  sharedCefrLookupHeadwords,
  withSharedCefrLevels,
  type WordSamplingOptions,
} from './sampling';

type Word = { id: string };

const words = (count: number): Word[] =>
  Array.from({ length: count }, (_, i) => ({ id: `w${i}` }));

const keyOf = (word: Word) => word.id;

function makeOptions(overrides: Partial<WordSamplingOptions> = {}): WordSamplingOptions {
  return {
    seed: 42,
    bookId: 'book-1',
    seenKeys: new Set<string>(),
    excludedKeys: new Set<string>(),
    ...overrides,
  };
}

test('returns all non-excluded words when the book is small', () => {
  const pool = words(4);
  const picked = sampleBookWords(pool, 8, keyOf, makeOptions({ excludedKeys: new Set(['w1']) }));
  assert.deepEqual(picked.map(keyOf).sort(), ['w0', 'w2', 'w3']);
});

test('never returns excluded words; empty when everything is excluded', () => {
  const pool = words(30);
  const excludedKeys = new Set(pool.slice(0, 20).map(keyOf));
  const picked = sampleBookWords(pool, 8, keyOf, makeOptions({ excludedKeys }));
  assert.ok(picked.every((word) => !excludedKeys.has(word.id)));

  const allExcluded = sampleBookWords(pool, 8, keyOf, makeOptions({ excludedKeys: new Set(pool.map(keyOf)) }));
  assert.deepEqual(allExcluded, []);
});

test('prefers unseen words while enough remain', () => {
  const pool = words(50);
  const seenKeys = new Set(pool.slice(0, 30).map(keyOf));
  const picked = sampleBookWords(pool, 8, keyOf, makeOptions({ seenKeys }));
  assert.equal(picked.length, 8);
  assert.ok(picked.every((word) => !seenKeys.has(word.id)), 'unseen pool suffices, no seen word expected');
});

test('fills the shortfall with seen words and never runs dry', () => {
  const pool = words(20);
  const seenKeys = new Set(pool.slice(0, 18).map(keyOf)); // only w18, w19 unseen
  const picked = sampleBookWords(pool, 5, keyOf, makeOptions({ seenKeys }));
  assert.equal(picked.length, 5);
  const unseenPicked = picked.filter((word) => !seenKeys.has(word.id)).map(keyOf).sort();
  assert.deepEqual(unseenPicked, ['w18', 'w19']);

  // Fully seen book still yields a full sample (recycle pool preserved).
  const allSeen = sampleBookWords(pool, 5, keyOf, makeOptions({ seenKeys: new Set(pool.map(keyOf)) }));
  assert.equal(allSeen.length, 5);
});

test('is deterministic and free of duplicates', () => {
  const pool = words(100);
  const seenKeys = new Set(pool.slice(0, 96).map(keyOf));
  const options = makeOptions({ seenKeys });
  const first = sampleBookWords(pool, 8, keyOf, options).map(keyOf);
  const second = sampleBookWords(pool, 8, keyOf, options).map(keyOf);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, first.length, 'no duplicate keys in one sample');
});

test('rotates across seeds so the whole book surfaces over time', () => {
  const pool = words(100);
  const single = new Set(sampleBookWords(pool, 8, keyOf, makeOptions({ seed: 1 })).map(keyOf));
  const union = new Set<string>();
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const word of sampleBookWords(pool, 8, keyOf, makeOptions({ seed }))) {
      union.add(word.id);
    }
  }
  assert.ok(union.size > single.size, `expected variety across seeds, got ${union.size}`);
});

test('different books rotate independently for the same seed', () => {
  const pool = words(100);
  const bookA = sampleBookWords(pool, 8, keyOf, makeOptions({ bookId: 'book-a' })).map(keyOf);
  const bookB = sampleBookWords(pool, 8, keyOf, makeOptions({ bookId: 'book-b' })).map(keyOf);
  assert.notDeepEqual(bookA, bookB);
});

// ---------- withSharedCefrLevels ----------

function makeBook(overrides: Partial<ReelBook> = {}): ReelBook {
  return {
    type: 'shared',
    id: 'book-1',
    title: 'Book',
    iconImage: null,
    sharedTags: [],
    eikenLevel: null,
    ownerName: null,
    wordCount: 10,
    likeCount: 0,
    createdAt: null,
    importedByMe: false,
    ...overrides,
  };
}

function makeCandidate(id: string, overrides: Partial<ReelCandidate> = {}): ReelCandidate {
  return {
    id,
    source: 'shared',
    wordId: id,
    english: `word-${id}`,
    pronunciation: null,
    japanese: `意味-${id}`,
    exampleSentence: null,
    exampleSentenceJa: null,
    partOfSpeechTags: [],
    cefrLevel: null,
    book: makeBook(),
    ...overrides,
  };
}

test('withSharedCefrLevels fills shared words via normalized headwords', () => {
  const candidates = [
    makeCandidate('a', { english: '  Elaborate ' }),
    makeCandidate('b', { english: 'unknownword' }),
    makeCandidate('c', {
      source: 'official',
      english: 'elaborate',
      cefrLevel: 'C1',
      book: makeBook({ type: 'official' }),
    }),
  ];
  const enriched = withSharedCefrLevels(candidates, new Map([['elaborate', 'B2']]));
  assert.equal(enriched[0].cefrLevel, 'B2');
  assert.equal(enriched[1].cefrLevel, null);
  assert.equal(enriched[2].cefrLevel, 'C1', 'official candidates stay untouched');
});

test('withSharedCefrLevels is a no-op for an empty map', () => {
  const candidates = [makeCandidate('a')];
  assert.equal(withSharedCefrLevels(candidates, new Map()), candidates);
});

test('sharedCefrLookupHeadwords collects only shared words missing a level', () => {
  const candidates = [
    makeCandidate('a', { english: ' Apple  Pie ' }),
    makeCandidate('b', { english: 'banana', cefrLevel: 'A1' }),
    makeCandidate('c', {
      source: 'official',
      english: 'cherry',
      book: makeBook({ type: 'official' }),
    }),
  ];
  assert.deepEqual(sharedCefrLookupHeadwords(candidates), ['apple pie']);
});
