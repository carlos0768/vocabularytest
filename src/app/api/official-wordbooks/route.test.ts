import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleOfficialWordbooksGet } from '@/app/api/official-wordbooks/route';
import { handleOfficialWordbookDetailGet } from '@/app/api/official-wordbooks/[slug]/route';
import type {
  OfficialWordbookCard,
  OfficialWordbookDetailPayload,
} from '@/lib/official-wordbooks/catalog';

const CARD: OfficialWordbookCard = {
  id: '0dd8f4d8-22cf-4010-b6e7-99485683023c',
  slug: 'eiken-pre1-core',
  title: '英検準1級 コア単語',
  description: null,
  eikenLevel: 'pre1',
  eikenLabel: '英検準1級',
  iconImage: null,
  sourceLabels: ['official', 'eiken:pre1'],
  wordCount: 420,
};

type ListOptions = { limit?: number; cursor?: string | null; query?: string | null };

function buildListDeps(captured: ListOptions[]) {
  return {
    listPublicOfficialWordbooks: (async (options: ListOptions = {}) => {
      captured.push(options);
      return { items: [CARD], nextCursor: 'cursor-2' };
    }) as never,
  };
}

type DetailCall = { slug: string; wordLimit?: number | null };

function buildDetailDeps(
  calls: DetailCall[],
  options: { user?: { id: string } | null; payload?: OfficialWordbookDetailPayload | null } = {},
) {
  const payload: OfficialWordbookDetailPayload = options.payload ?? {
    wordbook: CARD,
    words: [{ english: 'abandon', japanese: '見捨てる', distractors: [] }],
    totalWordCount: 420,
    previewOnly: false,
  };

  return {
    resolveAuthenticatedUser: (async () => options.user ?? null) as never,
    getPublicOfficialWordbook: (async (slug: string, opts: { wordLimit?: number | null } = {}) => {
      calls.push({ slug, wordLimit: opts.wordLimit });
      return options.payload === null ? null : payload;
    }) as never,
  };
}

test('公式単語帳の一覧をログインなしで返す', async () => {
  const captured: ListOptions[] = [];
  const response = await handleOfficialWordbooksGet(
    new NextRequest('http://localhost/api/official-wordbooks', { method: 'GET' }),
    buildListDeps(captured),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.items[0].slug, CARD.slug);
  assert.equal(payload.nextCursor, 'cursor-2');
  // 一覧に単語の中身は含めない (中身は /api/official-wordbooks/[slug] 側)
  assert.equal('words' in payload.items[0], false);
});

test('limit・cursor・検索語をそのまま一覧に渡す', async () => {
  const captured: ListOptions[] = [];
  await handleOfficialWordbooksGet(
    new NextRequest('http://localhost/api/official-wordbooks?limit=5&cursor=abc&q=%E8%8B%B1%E6%A4%9C', {
      method: 'GET',
    }),
    buildListDeps(captured),
  );

  assert.equal(captured[0].limit, 5);
  assert.equal(captured[0].cursor, 'abc');
  assert.equal(captured[0].query, '英検');
});

test('未ログインには先頭数語のプレビューだけを取りに行く', async () => {
  const calls: DetailCall[] = [];
  const response = await handleOfficialWordbookDetailGet(
    new NextRequest('http://localhost/api/official-wordbooks/eiken-pre1-core', { method: 'GET' }),
    'eiken-pre1-core',
    buildDetailDeps(calls, { user: null }),
  );

  assert.equal(response.status, 200);
  assert.equal(calls[0].slug, 'eiken-pre1-core');
  assert.equal(calls[0].wordLimit, 5);
});

test('ログイン済みには全単語を取りに行く', async () => {
  const calls: DetailCall[] = [];
  const response = await handleOfficialWordbookDetailGet(
    new NextRequest('http://localhost/api/official-wordbooks/eiken-pre1-core', { method: 'GET' }),
    'eiken-pre1-core',
    buildDetailDeps(calls, { user: { id: 'user-1' } }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.words[0].english, 'abandon');
  assert.equal(calls[0].wordLimit, null);
});

test('非公開・存在しない公式単語帳は404', async () => {
  const calls: DetailCall[] = [];
  const response = await handleOfficialWordbookDetailGet(
    new NextRequest('http://localhost/api/official-wordbooks/draft-book', { method: 'GET' }),
    'draft-book',
    buildDetailDeps(calls, { user: { id: 'user-1' }, payload: null }),
  );

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.success, false);
});
