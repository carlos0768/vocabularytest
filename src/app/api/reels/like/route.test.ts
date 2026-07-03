import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleReelLikePost } from './route';

const WORD_ID = '2f1e8a34-9c1d-4b6f-8a2e-3d5c7b9e0f14';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/reels/like', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const authedUser = {
  requireAuthenticatedUser: async () => ({
    ok: true as const,
    user: { id: 'user-1' } as never,
  }),
};

test('reel like rejects unauthenticated requests', async () => {
  const res = await handleReelLikePost(
    makeRequest({ source: 'shared', wordId: WORD_ID, liked: true }),
    {
      requireAuthenticatedUser: async () => ({
        ok: false as const,
        response: NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 }),
      }),
      setReelWordLike: async () => ({ liked: true, likeCount: 1 }),
    },
  );
  assert.equal(res.status, 401);
});

test('reel like validates the body strictly', async () => {
  const badBodies = [
    { source: 'bogus', wordId: WORD_ID, liked: true },
    { source: 'shared', wordId: 'not-a-uuid', liked: true },
    { source: 'shared', wordId: WORD_ID, liked: 'yes' },
    { source: 'shared', wordId: WORD_ID, liked: true, extra: 1 },
  ];
  for (const body of badBodies) {
    const res = await handleReelLikePost(makeRequest(body), {
      ...authedUser,
      setReelWordLike: async () => ({ liked: true, likeCount: 1 }),
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('reel like toggles and returns new state', async () => {
  let received: { source: string; wordId: string; liked: boolean } | null = null;
  const res = await handleReelLikePost(
    makeRequest({ source: 'official', wordId: WORD_ID, liked: true }),
    {
      ...authedUser,
      setReelWordLike: async (options) => {
        received = { source: options.source, wordId: options.wordId, liked: options.liked };
        return { liked: true, likeCount: 5 };
      },
    },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(received, { source: 'official', wordId: WORD_ID, liked: true });
  const payload = await res.json();
  assert.deepEqual(payload, { success: true, liked: true, likeCount: 5 });
});

test('reel like returns 404 for missing words', async () => {
  const res = await handleReelLikePost(
    makeRequest({ source: 'shared', wordId: WORD_ID, liked: false }),
    {
      ...authedUser,
      setReelWordLike: async () => null,
    },
  );
  assert.equal(res.status, 404);
});
