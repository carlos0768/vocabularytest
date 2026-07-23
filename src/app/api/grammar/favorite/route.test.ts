import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarFavoritePost } from '@/app/api/grammar/favorite/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const BOOK_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';

type FakeState = {
  owns: boolean;
  updated: Record<string, unknown>[];
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table !== 'grammar_books') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        update: (row: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  if (!state.owns) return { data: null, error: null };
                  state.updated.push(row);
                  return { data: { id: BOOK_ID, is_favorite: row.is_favorite }, error: null };
                },
              }),
            }),
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
    return { ok: true as const, supabase: buildFakeSupabase(state), user: { id: 'user-1' } };
  }) as unknown as typeof requireProUser;
  return { requirePro };
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/grammar/favorite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('grammar/favorite rejects non-Pro users with 403', async () => {
  const state: FakeState = { owns: true, updated: [] };
  const response = await handleGrammarFavoritePost(
    postRequest({ bookId: BOOK_ID, isFavorite: true }),
    buildDeps(state, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(state.updated.length, 0);
});

test('grammar/favorite rejects a malformed body with 400', async () => {
  const response = await handleGrammarFavoritePost(
    postRequest({ bookId: BOOK_ID }),
    buildDeps({ owns: true, updated: [] }),
  );
  assert.equal(response.status, 400);
});

test('grammar/favorite toggles the flag and returns the new state', async () => {
  const state: FakeState = { owns: true, updated: [] };
  const response = await handleGrammarFavoritePost(
    postRequest({ bookId: BOOK_ID, isFavorite: true }),
    buildDeps(state),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.isFavorite, true);
  assert.equal(state.updated[0].is_favorite, true);
});

test('grammar/favorite returns 403 for a book the user does not own', async () => {
  const state: FakeState = { owns: false, updated: [] };
  const response = await handleGrammarFavoritePost(
    postRequest({ bookId: BOOK_ID, isFavorite: false }),
    buildDeps(state),
  );
  assert.equal(response.status, 403);
});
