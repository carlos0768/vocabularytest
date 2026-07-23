import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import {
  handleChatGptGrammarBooksGet,
  handleChatGptGrammarBooksPost,
} from '@/app/api/chatgpt/grammar-books/route';
import type { requireProUser } from '@/lib/api/pro-auth';

type FakeState = {
  rows?: { id: string; title: string; updated_at: string; is_favorite?: boolean }[];
  createdTitles?: string[];
  questionRows?: { book_id: string }[];
  masteredRows?: { book_id: string }[];
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'grammar_books') {
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
                state.createdTitles?.push(row.title);
                return { data: { id: 'book-1', title: row.title }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'grammar_questions') {
        // GET が問題数集計に使う: .select('book_id').eq('user_id', ...)
        return {
          select: () => ({
            eq: async () => ({ data: state.questionRows ?? [], error: null }),
          }),
        };
      }
      if (table === 'grammar_question_progress') {
        // GET が習得数集計に使う: .select('book_id').eq('user_id').eq('mastered', true)
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: state.masteredRows ?? [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
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
  return new NextRequest(`http://localhost/api/chatgpt/grammar-books${query}`, { method: 'GET' });
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/chatgpt/grammar-books', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('grammar-books GET returns the pro-gate response for non-Pro users', async () => {
  const response = await handleChatGptGrammarBooksGet(
    getRequest(),
    buildDeps({}, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
});

test('grammar-books GET lists books with favorite + mastery stats', async () => {
  const response = await handleChatGptGrammarBooksGet(
    getRequest('?limit=5'),
    buildDeps({
      rows: [{ id: 'b1', title: '語法問題集', updated_at: '2026-07-23T00:00:00Z', is_favorite: true }],
      questionRows: [{ book_id: 'b1' }, { book_id: 'b1' }, { book_id: 'b1' }],
      masteredRows: [{ book_id: 'b1' }, { book_id: 'b1' }],
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.books, [
    {
      id: 'b1',
      title: '語法問題集',
      updatedAt: '2026-07-23T00:00:00Z',
      isFavorite: true,
      questionCount: 3,
      masteredCount: 2,
    },
  ]);
});

test('grammar-books POST returns 400 for a missing title', async () => {
  const response = await handleChatGptGrammarBooksPost(
    postRequest({}),
    buildDeps({}),
  );
  assert.equal(response.status, 400);
});

test('grammar-books POST creates a book', async () => {
  const createdTitles: string[] = [];
  const response = await handleChatGptGrammarBooksPost(
    postRequest({ title: 'Vintage風 語法' }),
    buildDeps({ createdTitles }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.book.title, 'Vintage風 語法');
  assert.deepEqual(createdTitles, ['Vintage風 語法']);
});
