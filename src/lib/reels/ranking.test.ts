import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReelBook, ReelCandidate, ReelRankingContext } from './types';
import { rankReelCandidates, scoreReelCandidate, selectReelCandidates } from './ranking';

const NOW = '2026-07-03T00:00:00.000Z';

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
    createdAt: NOW,
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

function makeContext(overrides: Partial<ReelRankingContext> = {}): ReelRankingContext {
  return { eikenLevel: 'pre2', interestTags: [], now: NOW, ...overrides };
}

test('pre2 user prefers in-band CEFR words over C1 words', () => {
  const ctx = makeContext({ eikenLevel: 'pre2' });
  const inBand = makeCandidate('a', {
    source: 'official',
    cefrLevel: 'A2',
    book: makeBook({ type: 'official', id: 'official-1' }),
  });
  const tooHard = makeCandidate('b', {
    source: 'official',
    cefrLevel: 'C1',
    book: makeBook({ type: 'official', id: 'official-2' }),
  });

  // Compare across several seeds so jitter cannot flip the outcome by luck.
  for (const seed of [1, 42, 999, 123456]) {
    assert.ok(
      scoreReelCandidate(inBand, ctx, seed) > scoreReelCandidate(tooHard, ctx, seed) - 1,
      'in-band word should not be dominated once jitter (max 1.0) is excluded',
    );
  }
  // With jitter stripped out (same id ⇒ same jitter), levelFit dominates.
  const sameIdInBand = makeCandidate('same', {
    source: 'official',
    cefrLevel: 'A2',
    book: makeBook({ type: 'official', id: 'official-1' }),
  });
  const sameIdTooHard = makeCandidate('same', {
    source: 'official',
    cefrLevel: 'C1',
    book: makeBook({ type: 'official', id: 'official-2', eikenLevel: null }),
  });
  assert.ok(scoreReelCandidate(sameIdInBand, ctx, 7) > scoreReelCandidate(sameIdTooHard, ctx, 7));
});

test('tag overlap outranks no overlap at equal level', () => {
  const ctx = makeContext({ interestTags: ['toeic', '旅行'] });
  const matching = makeCandidate('same', {
    book: makeBook({ id: 'b1', sharedTags: ['TOEIC'] }),
  });
  const nonMatching = makeCandidate('same', {
    book: makeBook({ id: 'b2', sharedTags: ['料理'] }),
  });
  assert.ok(scoreReelCandidate(matching, ctx, 5) > scoreReelCandidate(nonMatching, ctx, 5));
});

test('fixed seed produces deterministic order', () => {
  const ctx = makeContext();
  const candidates = Array.from({ length: 20 }, (_, i) =>
    makeCandidate(`c${i}`, { book: makeBook({ id: `book-${i % 5}` }) }),
  );
  const first = rankReelCandidates(candidates, ctx, 42, 8).map((c) => c.id);
  const second = rankReelCandidates(candidates, ctx, 42, 8).map((c) => c.id);
  assert.deepEqual(first, second);
  const differentSeed = rankReelCandidates(candidates, ctx, 43, 8).map((c) => c.id);
  assert.notDeepEqual(first, differentSeed);
});

test('no two consecutive items from the same book when avoidable', () => {
  const ctx = makeContext();
  const candidates = Array.from({ length: 30 }, (_, i) =>
    makeCandidate(`c${i}`, { book: makeBook({ id: `book-${i % 6}` }) }),
  );
  const picked = rankReelCandidates(candidates, ctx, 7, 10);
  for (let i = 1; i < picked.length; i += 1) {
    assert.notEqual(picked[i].book.id, picked[i - 1].book.id);
  }
});

test('caps items per book per page at 2', () => {
  const ctx = makeContext();
  const candidates = [
    ...Array.from({ length: 10 }, (_, i) =>
      makeCandidate(`a${i}`, { book: makeBook({ id: 'book-a', likeCount: 1000 }) }),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      makeCandidate(`b${i}`, { book: makeBook({ id: `book-b${i}` }) }),
    ),
  ];
  const picked = rankReelCandidates(candidates, ctx, 11, 8);
  const fromA = picked.filter((c) => c.book.id === 'book-a').length;
  assert.ok(fromA <= 2, `expected at most 2 from book-a, got ${fromA}`);
});

test('relaxes consecutive rule when only one book remains', () => {
  const ctx = makeContext();
  const candidates = Array.from({ length: 2 }, (_, i) =>
    makeCandidate(`only${i}`, { book: makeBook({ id: 'solo' }) }),
  );
  const picked = rankReelCandidates(candidates, ctx, 3, 5);
  assert.equal(picked.length, 2);
});

test('returns empty for empty input or zero limit', () => {
  const ctx = makeContext();
  assert.deepEqual(rankReelCandidates([], ctx, 1, 5), []);
  assert.deepEqual(rankReelCandidates([makeCandidate('x')], ctx, 1, 0), []);
});

test('semantic tag similarity outranks plain string overlap', () => {
  const base = makeContext({ interestTags: ['toeic'] });
  const semanticCtx = { ...base, tagSimilarityByBookId: { 'book-sem': 0.9 } };
  const semanticMatch = makeCandidate('same', {
    book: makeBook({ id: 'book-sem', sharedTags: ['ビジネス英語'] }),
  });
  const noSignal = makeCandidate('same', {
    book: makeBook({ id: 'book-none', sharedTags: ['料理'] }),
  });
  assert.ok(
    scoreReelCandidate(semanticMatch, semanticCtx, 3) > scoreReelCandidate(noSignal, semanticCtx, 3),
  );
});

test('interested feedback boosts the book, not-interested penalizes it', () => {
  const interestedCtx = makeContext({ interestedBookRefs: ['s:share-a'] });
  const notInterestedCtx = makeContext({ notInterestedBookCounts: { 's:share-a': 3 } });
  const neutralCtx = makeContext();

  const candidate = makeCandidate('same', {
    book: makeBook({ id: 'b1', shareId: 'share-a' }),
  });

  const neutral = scoreReelCandidate(candidate, neutralCtx, 9);
  assert.ok(scoreReelCandidate(candidate, interestedCtx, 9) > neutral);
  assert.ok(scoreReelCandidate(candidate, notInterestedCtx, 9) < neutral);
});

// ---------- selectReelCandidates (infinite feed / seen recycling) ----------

test('selectReelCandidates returns unseen-only when the pool is sufficient', () => {
  const ctx = makeContext();
  const candidates = Array.from({ length: 20 }, (_, i) =>
    makeCandidate(`c${i}`, { book: makeBook({ id: `book-${i % 5}` }) }),
  );
  const selections = selectReelCandidates(candidates, {}, ctx, 42, 8);
  assert.equal(selections.length, 8);
  assert.ok(selections.every((s) => s.recycled === false));
  const ranked = rankReelCandidates(candidates, ctx, 42, 8).map((c) => c.id);
  assert.deepEqual(selections.map((s) => s.candidate.id), ranked);
});

test('selectReelCandidates fills the shortfall with least-recently-seen words', () => {
  const ctx = makeContext();
  const candidates = Array.from({ length: 6 }, (_, i) =>
    makeCandidate(`c${i}`, { book: makeBook({ id: `book-${i}` }) }),
  );
  // c0..c3 already seen; c2 is the oldest, c1 the freshest.
  const seenAtByKey = {
    c0: '2026-07-02T00:00:00.000Z',
    c1: '2026-07-03T00:00:00.000Z',
    c2: '2026-07-01T00:00:00.000Z',
    c3: '2026-07-02T12:00:00.000Z',
  };
  const selections = selectReelCandidates(candidates, seenAtByKey, ctx, 7, 4);
  assert.equal(selections.length, 4);
  const unseenPart = selections.filter((s) => !s.recycled).map((s) => s.candidate.id).sort();
  assert.deepEqual(unseenPart, ['c4', 'c5']);
  const recycledPart = selections.filter((s) => s.recycled).map((s) => s.candidate.id);
  assert.equal(recycledPart.length, 2);
  // The freshest-seen word (c1) must not be recycled while older ones exist
  // (needed*3 = 6 covers all four seen words, ranked among the oldest first).
  assert.ok(recycledPart.includes('c2'), 'oldest seen word should be in the recycle pool');
});

test('selectReelCandidates never returns empty when everything was seen', () => {
  const ctx = makeContext();
  const candidates = Array.from({ length: 30 }, (_, i) =>
    makeCandidate(`c${i}`, { book: makeBook({ id: `book-${i % 6}` }) }),
  );
  const seenAtByKey = Object.fromEntries(
    candidates.map((c, i) => [c.id, `2026-07-0${(i % 3) + 1}T00:00:00.000Z`]),
  );
  const selections = selectReelCandidates(candidates, seenAtByKey, ctx, 5, 8);
  assert.equal(selections.length, 8);
  assert.ok(selections.every((s) => s.recycled === true));
});

test('selectReelCandidates is deterministic for a fixed seed', () => {
  const ctx = makeContext();
  const candidates = Array.from({ length: 25 }, (_, i) =>
    makeCandidate(`c${i}`, { book: makeBook({ id: `book-${i % 5}` }) }),
  );
  const seenAtByKey = Object.fromEntries(
    candidates.slice(0, 20).map((c, i) => [c.id, `2026-06-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`]),
  );
  const first = selectReelCandidates(candidates, seenAtByKey, ctx, 99, 8);
  const second = selectReelCandidates(candidates, seenAtByKey, ctx, 99, 8);
  assert.deepEqual(
    first.map((s) => [s.candidate.id, s.recycled]),
    second.map((s) => [s.candidate.id, s.recycled]),
  );
});
