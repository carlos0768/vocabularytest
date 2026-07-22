import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import {
  handleChatGptProjectsGet,
  handleChatGptProjectsPost,
} from '@/app/api/chatgpt/projects/route';
import type { requireProUser } from '@/lib/api/pro-auth';

type FakeState = {
  rows?: { id: string; title: string; updated_at: string }[];
  createdTitles?: string[];
  createError?: { message: string } | null;
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table !== 'projects') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: state.rows ?? [], error: null }),
            }),
          }),
        }),
        insert: (row: { title: string }) => ({
          select: () => ({
            single: async () => {
              if (state.createError) {
                return { data: null, error: state.createError };
              }
              state.createdTitles?.push(row.title);
              return { data: { id: 'project-1', title: row.title }, error: null };
            },
          }),
        }),
      };
    },
  };
}

function buildDeps(state: FakeState, options?: { proFailure?: NextResponse }) {
  const requirePro = (async () => {
    if (options?.proFailure) {
      return { ok: false as const, response: options.proFailure };
    }
    return {
      ok: true as const,
      supabase: buildFakeSupabase(state),
      user: { id: 'user-1' },
    };
  }) as unknown as typeof requireProUser;

  return { requirePro };
}

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/chatgpt/projects${query}`, { method: 'GET' });
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/chatgpt/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('chatgpt/projects GET returns the pro-gate response for non-Pro users', async () => {
  const response = await handleChatGptProjectsGet(
    getRequest(),
    buildDeps({}, {
      proFailure: NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 }),
    }),
  );
  assert.equal(response.status, 401);
});

test('chatgpt/projects GET returns 400 for invalid query params', async () => {
  const response = await handleChatGptProjectsGet(
    getRequest('?limit=999'),
    buildDeps({}),
  );
  assert.equal(response.status, 400);
});

test('chatgpt/projects GET lists wordbooks in camelCase', async () => {
  const response = await handleChatGptProjectsGet(
    getRequest('?limit=5'),
    buildDeps({
      rows: [{ id: 'p1', title: 'ChatGPT英単語', updated_at: '2026-07-22T00:00:00Z' }],
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.projects, [
    { id: 'p1', title: 'ChatGPT英単語', updatedAt: '2026-07-22T00:00:00Z' },
  ]);
});

test('chatgpt/projects POST returns the pro-gate response for non-Pro users', async () => {
  const response = await handleChatGptProjectsPost(
    postRequest({ title: '新しい単語帳' }),
    buildDeps({}, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
});

test('chatgpt/projects POST returns 400 for a missing title', async () => {
  const response = await handleChatGptProjectsPost(
    postRequest({}),
    buildDeps({}),
  );
  assert.equal(response.status, 400);
});

test('chatgpt/projects POST creates a wordbook', async () => {
  const createdTitles: string[] = [];
  const response = await handleChatGptProjectsPost(
    postRequest({ title: 'ChatGPTで学んだ単語' }),
    buildDeps({ createdTitles }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.project.title, 'ChatGPTで学んだ単語');
  assert.deepEqual(createdTitles, ['ChatGPTで学んだ単語']);
});

test('chatgpt/projects POST maps the wordbook cap error to 403', async () => {
  const response = await handleChatGptProjectsPost(
    postRequest({ title: '51冊目' }),
    buildDeps({ createError: { message: 'FREE_WORDBOOK_LIMIT_EXCEEDED: free plan allows up to 50 wordbooks' } }),
  );
  assert.equal(response.status, 403);
});
