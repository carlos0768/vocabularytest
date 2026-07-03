import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleReelFeedbackPost } from './route';

const WORD_ID = '2f1e8a34-9c1d-4b6f-8a2e-3d5c7b9e0f14';

const authedUser = {
  requireAuthenticatedUser: async () => ({
    ok: true as const,
    user: { id: 'user-1' } as never,
  }),
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/reels/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('feedback requires auth', async () => {
  const res = await handleReelFeedbackPost(
    makeRequest({ source: 'shared', wordId: WORD_ID, feedback: 'interested' }),
    {
      requireAuthenticatedUser: async () => ({
        ok: false as const,
        response: NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 }),
      }),
      setReelWordFeedback: async () => ({ feedback: 'interested' as const }),
    },
  );
  assert.equal(res.status, 401);
});

test('feedback validates body strictly', async () => {
  const badBodies = [
    { source: 'shared', wordId: WORD_ID, feedback: 'meh' },
    { source: 'nope', wordId: WORD_ID, feedback: 'interested' },
    { source: 'shared', wordId: 'not-uuid', feedback: 'interested' },
    { source: 'shared', wordId: WORD_ID, feedback: 'interested', extra: 1 },
  ];
  for (const body of badBodies) {
    const res = await handleReelFeedbackPost(makeRequest(body), {
      ...authedUser,
      setReelWordFeedback: async () => ({ feedback: 'interested' as const }),
    });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('feedback stores and echoes the value', async () => {
  let received: { feedback: string } | null = null;
  const res = await handleReelFeedbackPost(
    makeRequest({ source: 'official', wordId: WORD_ID, feedback: 'not_interested' }),
    {
      ...authedUser,
      setReelWordFeedback: async (options) => {
        received = { feedback: options.feedback };
        return { feedback: options.feedback };
      },
    },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(received, { feedback: 'not_interested' });
  const payload = await res.json();
  assert.deepEqual(payload, { success: true, feedback: 'not_interested' });
});

test('feedback returns 404 for missing word', async () => {
  const res = await handleReelFeedbackPost(
    makeRequest({ source: 'shared', wordId: WORD_ID, feedback: 'interested' }),
    {
      ...authedUser,
      setReelWordFeedback: async () => null,
    },
  );
  assert.equal(res.status, 404);
});
