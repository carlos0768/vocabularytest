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
  // マイグレーション未適用をシミュレートするフラグ
  favoriteColumnMissing?: boolean;
  progressTableMissing?: boolean;
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'grammar_books') {
        return {
          select: (columns: string) => ({
            eq: () => ({
              order: () => ({
                limit: async () => {
                  // is_favorite 列が未マイグレーションの環境: その列を含む取得は失敗し、
                  // 列を外した再取得(フォールバック)だけが成功する。
                  if (state.favoriteColumnMissing && columns.includes('is_favorite')) {
                    return { data: null, error: { message: 'column grammar_books.is_favorite does not exist' } };
                  }
                  const rows = (state.rows ?? []).map((row) =>
                    columns.includes('is_favorite')
                      ? row
                      : { id: row.id, title: row.title, updated_at: row.updated_at },
                  );
                  return { data: rows, error: null };
                },
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
              eq: async () => {
                // テーブルが未マイグレーションの環境をシミュレート
                if (state.progressTableMissing) {
                  return { data: null, error: { message: 'relation "grammar_question_progress" does not exist' } };
                }
                return { data: state.masteredRows ?? [], error: null };
              },
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

test('grammar-books GET falls back and still lists books when is_favorite column is missing', async () => {
  // 20260723070000 マイグレーション未適用でも一覧が読めること (問題集が読み込めない回帰の防止)
  const response = await handleChatGptGrammarBooksGet(
    getRequest('?limit=5'),
    buildDeps({
      rows: [{ id: 'b1', title: '語法問題集', updated_at: '2026-07-23T00:00:00Z', is_favorite: true }],
      questionRows: [{ book_id: 'b1' }, { book_id: 'b1' }],
      favoriteColumnMissing: true,
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.books.length, 1);
  assert.equal(payload.books[0].isFavorite, false);
  assert.equal(payload.books[0].questionCount, 2);
  assert.equal(payload.books[0].masteredCount, 0);
});

test('grammar-books GET still lists books when progress table is missing', async () => {
  const response = await handleChatGptGrammarBooksGet(
    getRequest('?limit=5'),
    buildDeps({
      rows: [{ id: 'b1', title: '語法問題集', updated_at: '2026-07-23T00:00:00Z', is_favorite: true }],
      questionRows: [{ book_id: 'b1' }, { book_id: 'b1' }, { book_id: 'b1' }],
      progressTableMissing: true,
    }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.books[0].isFavorite, true);
  assert.equal(payload.books[0].questionCount, 3);
  assert.equal(payload.books[0].masteredCount, 0);
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
