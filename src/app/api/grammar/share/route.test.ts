import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import {
  handleGrammarShareDelete,
  handleGrammarSharedByMeGet,
  handleGrammarSharePost,
} from '@/app/api/grammar/share/route';
import {
  handleGrammarShareGet,
  handleGrammarShareImportPost,
} from '@/app/api/grammar/share/[shareId]/route';
import type { requireProUser } from '@/lib/api/pro-auth';
import type { requireAuthenticatedUser } from '@/app/api/shared-projects/shared';
import type { PublicGrammarBookCard } from '@/lib/grammar/types';

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
  updatedRows: Record<string, unknown>[];
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
          update: (row: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                state.updatedShareIds.push(row.share_id as string);
                state.updatedRows.push(row);
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
    updatedRows: [],
    insertedBooks: [],
    insertedQuestionRows: [],
    ...overrides,
  };
}

const PUBLISHED_BOOK: PublicGrammarBookCard = {
  id: BOOK_ID,
  shareId: SHARE_ID,
  title: '時制編',
  questionCount: 12,
  importCount: 2,
  publishedAt: '2026-07-25T00:00:00Z',
  ownerUsername: 'ゆうき',
  ownerAccountId: 'yuki',
};

function buildAuthGate(userId = 'user-1', authenticated = true) {
  return (async () => {
    if (!authenticated) {
      return {
        ok: false as const,
        response: NextResponse.json({ success: false, error: '認証が必要です。' }, { status: 401 }),
      };
    }
    return { ok: true as const, user: { id: userId } };
  }) as unknown as typeof requireAuthenticatedUser;
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
      countImport: async () => {},
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
      countImport: async () => {},
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
      countImport: async () => {},
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
      countImport: async () => {},
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
      countImport: async () => {},
    },
  );
  assert.equal(response.status, 403);
});

test('grammar share POST with publish marks the book public', async () => {
  const state = emptyState();
  const response = await handleGrammarSharePost(postShareRequest({ bookId: BOOK_ID, publish: true }), {
    requirePro: buildProGate(state),
    generateShareId: () => SHARE_ID,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.isPublic, true);
  assert.equal(state.updatedRows[0].share_id, SHARE_ID);
  assert.equal(state.updatedRows[0].is_public, true);
  assert.equal(typeof state.updatedRows[0].published_at, 'string');
});

test('grammar share POST with publish re-publishes a book that already has a link', async () => {
  const state = emptyState({ existingShareId: 'existing-share-id' });
  const response = await handleGrammarSharePost(postShareRequest({ bookId: BOOK_ID, publish: true }), {
    requirePro: buildProGate(state),
    generateShareId: () => SHARE_ID,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.shareId, 'existing-share-id');
  // リンク発行済みでも is_public を立て直す
  assert.equal(state.updatedRows.length, 1);
  assert.equal(state.updatedRows[0].is_public, true);
});

test('grammar share POST without publish keeps the book off the shared page', async () => {
  const state = emptyState();
  await handleGrammarSharePost(postShareRequest({ bookId: BOOK_ID }), {
    requirePro: buildProGate(state),
    generateShareId: () => SHARE_ID,
  });

  assert.equal('is_public' in state.updatedRows[0], false);
});

test('grammar shared-by-me GET requires authentication', async () => {
  const response = await handleGrammarSharedByMeGet(
    new NextRequest('http://localhost/api/grammar/share', { method: 'GET' }),
    {
      requireAuth: buildAuthGate('user-1', false),
      listMine: async () => [PUBLISHED_BOOK],
      unpublish: async () => true,
    },
  );
  assert.equal(response.status, 401);
});

test('grammar shared-by-me GET returns the books published by the viewer', async () => {
  const requestedUserIds: string[] = [];
  const response = await handleGrammarSharedByMeGet(
    new NextRequest('http://localhost/api/grammar/share', { method: 'GET' }),
    {
      requireAuth: buildAuthGate('user-1'),
      listMine: async (userId: string) => {
        requestedUserIds.push(userId);
        return [PUBLISHED_BOOK];
      },
      unpublish: async () => true,
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(requestedUserIds, ['user-1']);
  assert.equal(payload.books[0].shareId, SHARE_ID);
});

test('grammar share DELETE stops the sharing of the viewer own book', async () => {
  const calls: { userId: string; bookId: string }[] = [];
  const response = await handleGrammarShareDelete(
    new NextRequest(`http://localhost/api/grammar/share?bookId=${BOOK_ID}`, { method: 'DELETE' }),
    {
      requireAuth: buildAuthGate('user-1'),
      listMine: async () => [],
      unpublish: async (userId: string, bookId: string) => {
        calls.push({ userId, bookId });
        return true;
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: 'user-1', bookId: BOOK_ID }]);
});

test('grammar share DELETE rejects a book the viewer does not own', async () => {
  const response = await handleGrammarShareDelete(
    new NextRequest(`http://localhost/api/grammar/share?bookId=${BOOK_ID}`, { method: 'DELETE' }),
    {
      requireAuth: buildAuthGate('user-2'),
      listMine: async () => [],
      unpublish: async () => false,
    },
  );
  assert.equal(response.status, 403);
});

test('grammar share DELETE requires a book id', async () => {
  const response = await handleGrammarShareDelete(
    new NextRequest('http://localhost/api/grammar/share', { method: 'DELETE' }),
    {
      requireAuth: buildAuthGate('user-1'),
      listMine: async () => [],
      unpublish: async () => true,
    },
  );
  assert.equal(response.status, 400);
});
