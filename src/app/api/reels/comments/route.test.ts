import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleReelCommentsGet, handleReelCommentsPost } from './route';

const WORD_ID = '2f1e8a34-9c1d-4b6f-8a2e-3d5c7b9e0f14';

const authedUser = {
  requireAuthenticatedUser: async () => ({
    ok: true as const,
    user: { id: 'user-1' } as never,
  }),
};

const sampleComment = {
  id: 'c1',
  body: 'いい単語！',
  createdAt: '2026-07-03T00:00:00.000Z',
  authorName: 'テスト太郎',
  isMine: false,
};

function makeGetRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/reels/comments?${query}`, { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/reels/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('comments GET requires auth', async () => {
  const res = await handleReelCommentsGet(makeGetRequest(`source=shared&wordId=${WORD_ID}`), {
    requireAuthenticatedUser: async () => ({
      ok: false as const,
      response: NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 }),
    }),
    listReelWordComments: async () => [sampleComment],
    createReelWordComment: async () => sampleComment,
  });
  assert.equal(res.status, 401);
});

test('comments GET validates query params', async () => {
  for (const query of ['source=bogus&wordId=abc', `wordId=${WORD_ID}`, 'source=shared']) {
    const res = await handleReelCommentsGet(makeGetRequest(query), {
      ...authedUser,
      listReelWordComments: async () => [sampleComment],
      createReelWordComment: async () => sampleComment,
    });
    assert.equal(res.status, 400, `expected 400 for ${query}`);
  }
});

test('comments GET returns list and 404 for missing word', async () => {
  const okRes = await handleReelCommentsGet(makeGetRequest(`source=shared&wordId=${WORD_ID}`), {
    ...authedUser,
    listReelWordComments: async () => [sampleComment],
    createReelWordComment: async () => sampleComment,
  });
  assert.equal(okRes.status, 200);
  const payload = await okRes.json();
  assert.equal(payload.comments.length, 1);

  const missingRes = await handleReelCommentsGet(
    makeGetRequest(`source=official&wordId=${WORD_ID}`),
    {
      ...authedUser,
      listReelWordComments: async () => null,
      createReelWordComment: async () => sampleComment,
    },
  );
  assert.equal(missingRes.status, 404);
});

test('comments POST validates body strictly', async () => {
  const badBodies = [
    { source: 'shared', wordId: WORD_ID, body: '' },
    { source: 'shared', wordId: WORD_ID, body: 'a'.repeat(501) },
    { source: 'shared', wordId: 'not-uuid', body: 'ok' },
    { source: 'shared', wordId: WORD_ID, body: 'ok', extra: true },
  ];
  for (const body of badBodies) {
    const res = await handleReelCommentsPost(makePostRequest(body), {
      ...authedUser,
      listReelWordComments: async () => [],
      createReelWordComment: async () => sampleComment,
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 60)}`);
  }
});

test('comments POST creates and returns the comment', async () => {
  let received: { body: string } | null = null;
  const res = await handleReelCommentsPost(
    makePostRequest({ source: 'official', wordId: WORD_ID, body: '  勉強になる  ' }),
    {
      ...authedUser,
      listReelWordComments: async () => [],
      createReelWordComment: async (options) => {
        received = { body: options.body };
        return { ...sampleComment, isMine: true };
      },
    },
  );
  assert.equal(res.status, 200);
  // zod .trim() strips surrounding whitespace before the helper sees it
  assert.deepEqual(received, { body: '勉強になる' });
  const payload = await res.json();
  assert.equal(payload.comment.isMine, true);
});
