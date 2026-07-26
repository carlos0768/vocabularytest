import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleGrammarPublicGet } from '@/app/api/grammar/public/route';
import type { PublicGrammarBookCard } from '@/lib/grammar/types';

const BOOK: PublicGrammarBookCard = {
  id: '0dd8f4d8-22cf-4010-b6e7-99485683023c',
  shareId: 'abc123xyz789',
  title: '仮定法編',
  questionCount: 10,
  importCount: 4,
  publishedAt: '2026-07-25T00:00:00Z',
  ownerUsername: 'ゆうき',
  ownerAccountId: 'yuki',
};

type ListOptions = { limit?: number; cursor?: string | null; query?: string | null };

function buildDeps(captured: ListOptions[]) {
  return {
    listPublicBooks: (async (options: ListOptions = {}) => {
      captured.push(options);
      return { items: [BOOK], nextCursor: 'cursor-2' };
    }) as never,
  };
}

test('公開語法問題集の一覧を返す', async () => {
  const captured: ListOptions[] = [];
  const response = await handleGrammarPublicGet(
    new NextRequest('http://localhost/api/grammar/public', { method: 'GET' }),
    buildDeps(captured),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.items[0].shareId, BOOK.shareId);
  assert.equal(payload.nextCursor, 'cursor-2');
  // 問題文・解説は一覧に含めない (中身は shareId のページでログイン後に見る)
  assert.equal('questions' in payload.items[0], false);
});

test('limit・cursor・検索語をそのまま一覧に渡す', async () => {
  const captured: ListOptions[] = [];
  await handleGrammarPublicGet(
    new NextRequest('http://localhost/api/grammar/public?limit=5&cursor=abc&q=%E4%BB%AE%E5%AE%9A%E6%B3%95', {
      method: 'GET',
    }),
    buildDeps(captured),
  );

  assert.equal(captured[0].limit, 5);
  assert.equal(captured[0].cursor, 'abc');
  assert.equal(captured[0].query, '仮定法');
});

test('limit が数値でないときは既定値に任せる', async () => {
  const captured: ListOptions[] = [];
  await handleGrammarPublicGet(
    new NextRequest('http://localhost/api/grammar/public?limit=abc', { method: 'GET' }),
    buildDeps(captured),
  );

  assert.equal(captured[0].limit, undefined);
});

test('一覧の取得に失敗したら500を返す', async () => {
  const response = await handleGrammarPublicGet(
    new NextRequest('http://localhost/api/grammar/public', { method: 'GET' }),
    {
      listPublicBooks: (async () => {
        throw new Error('boom');
      }) as never,
    },
  );

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.success, false);
});
