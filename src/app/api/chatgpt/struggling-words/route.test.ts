import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleChatGptStrugglingWordsGet } from '@/app/api/chatgpt/struggling-words/route';
import type { requireProUser } from '@/lib/api/pro-auth';

type MissRow = {
  english_key: string;
  english: string;
  japanese: string;
  created_at: string;
};

function buildFakeSupabase(rows: MissRow[], error?: { message: string } | null) {
  return {
    from(table: string) {
      if (table !== 'quiz_word_misses') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => (error ? { data: null, error } : { data: rows, error: null }),
            }),
          }),
        }),
      };
    },
  };
}

function buildDeps(
  rows: MissRow[],
  options?: { proFailure?: NextResponse; fetchError?: { message: string } },
) {
  const requirePro = (async () => {
    if (options?.proFailure) {
      return { ok: false as const, response: options.proFailure };
    }
    return {
      ok: true as const,
      supabase: buildFakeSupabase(rows, options?.fetchError ?? null),
      user: { id: 'user-1' },
    };
  }) as unknown as typeof requireProUser;

  return { requirePro };
}

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/chatgpt/struggling-words${query}`, { method: 'GET' });
}

test('struggling-words returns the pro-gate response for non-Pro users', async () => {
  const response = await handleChatGptStrugglingWordsGet(
    getRequest(),
    buildDeps([], {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
});

test('struggling-words returns 400 for invalid query params', async () => {
  const response = await handleChatGptStrugglingWordsGet(
    getRequest('?limit=0'),
    buildDeps([]),
  );
  assert.equal(response.status, 400);
});

test('struggling-words aggregates the miss log by word and honors limit', async () => {
  const rows: MissRow[] = [
    { english_key: 'ubiquitous', english: 'ubiquitous', japanese: '遍在する', created_at: '2026-07-22T10:00:00Z' },
    { english_key: 'take off', english: 'take off', japanese: '離陸する', created_at: '2026-07-22T09:00:00Z' },
    { english_key: 'ubiquitous', english: 'ubiquitous', japanese: '遍在する', created_at: '2026-07-21T09:00:00Z' },
    { english_key: 'resilient', english: 'resilient', japanese: '回復力のある', created_at: '2026-07-20T09:00:00Z' },
  ];

  const response = await handleChatGptStrugglingWordsGet(
    getRequest('?limit=2'),
    buildDeps(rows),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.totalCount, 3);
  assert.equal(payload.words.length, 2);
  assert.deepEqual(payload.words[0], {
    english: 'ubiquitous',
    japanese: '遍在する',
    missCount: 2,
    lastMissedAt: '2026-07-22T10:00:00Z',
  });
});

test('struggling-words returns an empty list when the user has no misses', async () => {
  const response = await handleChatGptStrugglingWordsGet(getRequest(), buildDeps([]));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.words, []);
  assert.equal(payload.totalCount, 0);
});

test('struggling-words returns 500 when the miss log fetch fails', async () => {
  const response = await handleChatGptStrugglingWordsGet(
    getRequest(),
    buildDeps([], { fetchError: { message: 'db down' } }),
  );
  assert.equal(response.status, 500);
});
