import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarSharePost } from '@/app/api/grammar/share/route';
import {
  handleGrammarShareGet,
  handleGrammarShareImportPost,
} from '@/app/api/grammar/share/[shareId]/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const unauthorizedGate = (async () => ({
  ok: false as const,
  response: NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 }),
})) as unknown as typeof requireProUser;

const proGate = (async () => ({
  ok: false as const,
  response: NextResponse.json(
    { success: false, error: 'この機能はPro限定です。', code: 'PRO_REQUIRED' },
    { status: 403 },
  ),
})) as unknown as typeof requireProUser;

const mustNotResolve = async () => {
  throw new Error('shared book must not be resolved for rejected requests');
};

test('grammar/share POST rejects unauthenticated requests with 401', async () => {
  const response = await handleGrammarSharePost(
    new NextRequest('http://localhost/api/grammar/share', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookId: '0dd8f4d8-22cf-4010-b6e7-99485683023c' }),
    }),
    { requirePro: unauthorizedGate, generateShareId: () => 'x' },
  );
  assert.equal(response.status, 401);
});

test('grammar/share/[shareId] GET rejects unauthenticated requests with 401', async () => {
  const response = await handleGrammarShareGet(
    new NextRequest('http://localhost/api/grammar/share/some-share-id', { method: 'GET' }),
    { params: Promise.resolve({ shareId: 'some-share-id' }) },
    { resolveUser: async () => null, requirePro: proGate, resolveShared: mustNotResolve },
  );
  assert.equal(response.status, 401);
});

test('grammar/share/[shareId] import rejects non-Pro users with 403', async () => {
  const response = await handleGrammarShareImportPost(
    new NextRequest('http://localhost/api/grammar/share/some-share-id', { method: 'POST' }),
    { params: Promise.resolve({ shareId: 'some-share-id' }) },
    { resolveUser: async () => ({ id: 'user-1' }), requirePro: proGate, resolveShared: mustNotResolve },
  );
  assert.equal(response.status, 403);
});
