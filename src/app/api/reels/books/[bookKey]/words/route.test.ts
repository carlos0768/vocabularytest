import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleReelBookWordsGet } from './route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/reels/books/s:abc/words', { method: 'GET' });
}

const authedUser = {
  requireAuthenticatedUser: async () => ({
    ok: true as const,
    user: { id: 'user-1' } as never,
  }),
};

const samplePayload = {
  book: { type: 'shared' as const, title: 'Book', iconImage: null, shareId: 'abc' },
  words: [
    {
      english: 'apple',
      japanese: 'りんご',
      distractors: [],
    },
  ],
};

test('reel book words rejects malformed keys', async () => {
  const res = await handleReelBookWordsGet(makeRequest(), 'nonsense', {
    ...authedUser,
    getReelBookForImport: async () => samplePayload,
  });
  assert.equal(res.status, 400);
});

test('reel book words requires auth', async () => {
  const res = await handleReelBookWordsGet(makeRequest(), 's:abc', {
    requireAuthenticatedUser: async () => ({
      ok: false as const,
      response: NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 }),
    }),
    getReelBookForImport: async () => samplePayload,
  });
  assert.equal(res.status, 401);
});

test('reel book words returns payload for any logged-in user (free included)', async () => {
  const res = await handleReelBookWordsGet(makeRequest(), 's%3Aabc', {
    ...authedUser,
    getReelBookForImport: async (bookKey) => {
      assert.equal(bookKey, 's:abc');
      return samplePayload;
    },
  });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.book.shareId, 'abc');
  assert.equal(payload.words.length, 1);
});

test('reel book words returns 404 when book missing', async () => {
  const res = await handleReelBookWordsGet(makeRequest(), 'o:missing-slug', {
    ...authedUser,
    getReelBookForImport: async () => null,
  });
  assert.equal(res.status, 404);
});
