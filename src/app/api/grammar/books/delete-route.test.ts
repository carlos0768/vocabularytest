import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarBookDelete } from '@/app/api/grammar/books/[bookId]/route';
import type { requireProUser } from '@/lib/api/pro-auth';

type FakeState = {
  ownedBookIds?: string[];
  deletedIds?: string[];
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table !== 'grammar_books') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        delete: () => ({
          eq: (_column: string, bookId: string) => ({
            eq: () => ({
              select: async () => {
                if (!(state.ownedBookIds ?? []).includes(bookId)) {
                  return { data: [], error: null };
                }
                state.deletedIds?.push(bookId);
                return { data: [{ id: bookId }], error: null };
              },
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
    return {
      ok: true as const,
      supabase: buildFakeSupabase(state),
      user: { id: 'user-1' },
    };
  }) as unknown as typeof requireProUser;

  return { requirePro };
}

function deleteRequest(bookId: string) {
  return new NextRequest(`http://localhost/api/grammar/books/${bookId}`, { method: 'DELETE' });
}

function contextFor(bookId: string) {
  return { params: Promise.resolve({ bookId }) };
}

const BOOK_ID = '9f8b1c9e-3a70-4b2f-9a44-1d2f3c4b5a6e';

test('grammar book DELETE returns the pro-gate response for non-Pro users', async () => {
  const response = await handleGrammarBookDelete(
    deleteRequest(BOOK_ID),
    contextFor(BOOK_ID),
    buildDeps({}, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
});

test('grammar book DELETE returns 400 for a non-uuid book id', async () => {
  const response = await handleGrammarBookDelete(
    deleteRequest('not-a-uuid'),
    contextFor('not-a-uuid'),
    buildDeps({ ownedBookIds: [BOOK_ID] }),
  );
  assert.equal(response.status, 400);
});

test('grammar book DELETE returns 404 when the book is not owned', async () => {
  const response = await handleGrammarBookDelete(
    deleteRequest(BOOK_ID),
    contextFor(BOOK_ID),
    buildDeps({ ownedBookIds: [] }),
  );
  assert.equal(response.status, 404);
});

test('grammar book DELETE deletes an owned book', async () => {
  const deletedIds: string[] = [];
  const response = await handleGrammarBookDelete(
    deleteRequest(BOOK_ID),
    contextFor(BOOK_ID),
    buildDeps({ ownedBookIds: [BOOK_ID], deletedIds }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.deepEqual(deletedIds, [BOOK_ID]);
});
