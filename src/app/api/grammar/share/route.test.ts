import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarSharePost } from '@/app/api/grammar/share/route';
import {
  handleGrammarShareGet,
  handleGrammarShareImportPost,
} from '@/app/api/grammar/share/[shareId]/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const BOOK_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';
const SHARE_ID = 'abc123xyz789';

const SHARED_PAYLOAD = {
  book: { id: BOOK_ID, title: '時制編' },
  questions: [
    {
      sentence: 'She insisted that he ___ the meeting.',
      choices: ['attend', 'attends', 'attended', 'would attend'],
      correct_index: 0,
      explanation: 'insist that の後は動詞の原形。',
      grammar_point: '仮定法現在',
      sentence_ja: null,
    },
  ],
};

type ShareState = {
  ownsBook: boolean;
  existingShareId?: string | null;
  updatedShareIds: string[];
  insertedBooks: Record<string, unknown>[];
  insertedQuestionRows: Record<string, unknown>[][];
};

function buildFakeSupabase(state: ShareState) {
  return {
    from(table: string) {
      if (table === 'grammar_books') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.ownsBook ? { id: BOOK_ID, share_id: state.existingShareId ?? null } : null,
                  error: null,
                }),
              }),
            }),
          }),
          update: (row: { share_id: string }) => ({
            eq: () => ({
              eq: async () => {
                state.updatedShareIds.push(row.share_id);
                return { error: null };
              },
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                state.insertedBooks.push(row);
                return { data: { id: 'new-book-1', title: row.title }, error: null };
              },
            }),
          }),
        };
      }
      if (table === 'grammar_questions') {
        return {
          insert: async (rows: Record<string, unknown>[]) => {
            state.insertedQuestionRows.push(rows);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function buildProGate(state: ShareState, options?: { proFailure?: NextResponse }) {
  return (async () => {
    if (options?.proFailure) {
      return { ok: false as const, response: options.proFailure };
    }
    return {
      ok: true as const,
      supabase: buildFakeSupabase(state),
      user: { id: 'user-1' },
    };
  }) as unknown as typeof requireProUser;
}

function emptyState(overrides?: Partial<ShareState>): ShareState {
  return {
    ownsBook: true,
    existingShareId: null,
    updatedShareIds: [],
    insertedBooks: [],
    insertedQuestionRows: [],
    ...overrides,
  };
}

function postShareRequest(body: unknown) {
  return new NextRequest('http://localhost/api/grammar/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function shareContext(shareId = SHARE_ID) {
  return { params: Promise.resolve({ shareId }) };
}

test('grammar share POST rejects a book the user does not own', async () => {
  const state = emptyState({ ownsBook: false });
  const response = await handleGrammarSharePost(postShareRequest({ bookId: BOOK_ID }), {
    requirePro: buildProGate(state),
    generateShareId: () => SHARE_ID,
  });
  assert.equal(response.status, 403);
  assert.equal(state.updatedShareIds.length, 0);
});

test('grammar share POST issues a new share id', async () => {
  const state = emptyState();
  const response = await handleGrammarSharePost(postShareRequest({ bookId: BOOK_ID }), {
    requirePro: buildProGate(state),
    generateShareId: () => SHARE_ID,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.shareId, SHARE_ID);
  assert.equal(payload.sharePath, `/grammar/share/${SHARE_ID}`);
  assert.deepEqual(state.updatedShareIds, [SHARE_ID]);
});

test('grammar share POST reuses an existing share id', async () => {
  const state = emptyState({ existingShareId: 'existing-share-id' });
  const response = await handleGrammarSharePost(postShareRequest({ bookId: BOOK_ID }), {
    requirePro: buildProGate(state),
    generateShareId: () => SHARE_ID,
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.shareId, 'existing-share-id');
  assert.equal(state.updatedShareIds.length, 0);
});

test('grammar share view requires authentication', async () => {
  const response = await handleGrammarShareGet(
    new NextRequest(`http://localhost/api/grammar/share/${SHARE_ID}`, { method: 'GET' }),
    shareContext(),
    {
      resolveUser: async () => null,
      requirePro: buildProGate(emptyState()),
      resolveShared: async () => SHARED_PAYLOAD,
    },
  );
  assert.equal(response.status, 401);
});

test('grammar share view returns title, count, and answer-free preview', async () => {
  const response = await handleGrammarShareGet(
    new NextRequest(`http://localhost/api/grammar/share/${SHARE_ID}`, { method: 'GET' }),
    shareContext(),
    {
      resolveUser: async () => ({ id: 'viewer-1' }),
      requirePro: buildProGate(emptyState()),
      resolveShared: async () => SHARED_PAYLOAD,
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.book.title, '時制編');
  assert.equal(payload.book.questionCount, 1);
  assert.equal(payload.book.preview[0].sentence, SHARED_PAYLOAD.questions[0].sentence);
  // プレビューに正解・解説は含めない
  assert.equal('correctIndex' in payload.book.preview[0], false);
  assert.equal('explanation' in payload.book.preview[0], false);
});

test('grammar share view returns 404 for an unknown share id', async () => {
  const response = await handleGrammarShareGet(
    new NextRequest(`http://localhost/api/grammar/share/${SHARE_ID}`, { method: 'GET' }),
    shareContext(),
    {
      resolveUser: async () => ({ id: 'viewer-1' }),
      requirePro: buildProGate(emptyState()),
      resolveShared: async () => null,
    },
  );
  assert.equal(response.status, 404);
});

test('grammar share import copies the book and questions to the importer', async () => {
  const state = emptyState();
  const response = await handleGrammarShareImportPost(
    new NextRequest(`http://localhost/api/grammar/share/${SHARE_ID}`, { method: 'POST' }),
    shareContext(),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      requirePro: buildProGate(state),
      resolveShared: async () => SHARED_PAYLOAD,
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.book.id, 'new-book-1');
  assert.equal(payload.book.questionCount, 1);
  assert.equal(state.insertedBooks[0].user_id, 'user-1');
  const rows = state.insertedQuestionRows[0];
  assert.equal(rows[0].user_id, 'user-1');
  assert.equal(rows[0].book_id, 'new-book-1');
  assert.equal(rows[0].explanation, 'insist that の後は動詞の原形。');
});

test('grammar share import is pro-gated', async () => {
  const response = await handleGrammarShareImportPost(
    new NextRequest(`http://localhost/api/grammar/share/${SHARE_ID}`, { method: 'POST' }),
    shareContext(),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      requirePro: buildProGate(emptyState(), {
        proFailure: NextResponse.json(
          { success: false, error: 'この機能はPro限定です。', code: 'PRO_REQUIRED' },
          { status: 403 },
        ),
      }),
      resolveShared: async () => SHARED_PAYLOAD,
    },
  );
  assert.equal(response.status, 403);
});
