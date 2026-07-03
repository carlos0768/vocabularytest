import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ReelFeedPage } from '@/lib/reels/types';
import { clampReelFeedLimit, handleReelFeedGet } from './route';

const EMPTY_PAGE: ReelFeedPage = {
  items: [],
  nextCursor: null,
  usage: { remaining: 42, limit: 50, isPro: false },
  limitReached: false,
};

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

const fakeClient = {} as SupabaseClient;

test('reel feed rejects unauthenticated requests', async () => {
  const res = await handleReelFeedGet(makeRequest('http://localhost/api/reels/feed'), {
    requireAuthenticatedUser: async () => ({
      ok: false as const,
      response: NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 }),
    }),
    createRouteHandlerClient: async () => fakeClient,
    buildReelFeedPage: async () => EMPTY_PAGE,
  });
  assert.equal(res.status, 401);
});

test('reel feed clamps limit and forwards cursor', async () => {
  let received: { limit: number; cursor: string | null } | null = null;
  const res = await handleReelFeedGet(
    makeRequest('http://localhost/api/reels/feed?limit=999&cursor=abc'),
    {
      requireAuthenticatedUser: async () => ({
        ok: true as const,
        user: { id: 'user-1' } as never,
      }),
      createRouteHandlerClient: async () => fakeClient,
      buildReelFeedPage: async (options) => {
        received = { limit: options.limit, cursor: options.cursor };
        return EMPTY_PAGE;
      },
    },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(received, { limit: 12, cursor: 'abc' });
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.usage.limit, 50);
});

test('reel feed returns 500 with Japanese error on failure', async () => {
  const res = await handleReelFeedGet(makeRequest('http://localhost/api/reels/feed'), {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    createRouteHandlerClient: async () => fakeClient,
    buildReelFeedPage: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(res.status, 500);
  const payload = await res.json();
  assert.equal(payload.success, false);
  assert.match(payload.error, /リール/);
});

test('clampReelFeedLimit handles edge inputs', () => {
  assert.equal(clampReelFeedLimit(null), 8);
  assert.equal(clampReelFeedLimit(''), 8);
  assert.equal(clampReelFeedLimit('abc'), 8);
  assert.equal(clampReelFeedLimit('0'), 1);
  assert.equal(clampReelFeedLimit('5'), 5);
  assert.equal(clampReelFeedLimit('999'), 12);
  assert.equal(clampReelFeedLimit('-3'), 1);
});
