import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarProgressPost } from '@/app/api/grammar/progress/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const QUESTION_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';
const BOOK_ID = '1dd8f4d8-22cf-4010-b6e7-99485683023c';

type FakeState = {
  ownsQuestion: boolean;
  questionBookId?: string;
  existing?: { correct_count: number; wrong_count: number } | null;
  upserted: Record<string, unknown>[];
  missInserts: Record<string, unknown>[];
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'grammar_questions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.ownsQuestion ? { id: QUESTION_ID, book_id: state.questionBookId ?? BOOK_ID } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'grammar_question_progress') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: state.existing ?? null, error: null }),
              }),
            }),
          }),
          upsert: async (row: Record<string, unknown>) => {
            state.upserted.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'grammar_question_misses') {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.missInserts.push(row);
            return { error: null };
          },
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
    return { ok: true as const, supabase: buildFakeSupabase(state), user: { id: 'user-1' } };
  }) as unknown as typeof requireProUser;
  return { requirePro };
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/grammar/progress', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function emptyState(overrides?: Partial<FakeState>): FakeState {
  return { ownsQuestion: true, existing: null, upserted: [], missInserts: [], ...overrides };
}

test('grammar/progress rejects non-Pro users with 403', async () => {
  const state = emptyState();
  const response = await handleGrammarProgressPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID, result: 'correct' }),
    buildDeps(state, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(state.upserted.length, 0);
});

test('grammar/progress rejects an invalid result value with 400', async () => {
  const response = await handleGrammarProgressPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID, result: 'maybe' }),
    buildDeps(emptyState()),
  );
  assert.equal(response.status, 400);
});

test('grammar/progress returns 403 for a question the user does not own', async () => {
  const state = emptyState({ ownsQuestion: false });
  const response = await handleGrammarProgressPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID, result: 'correct' }),
    buildDeps(state),
  );
  assert.equal(response.status, 403);
  assert.equal(state.upserted.length, 0);
});

test('grammar/progress returns 403 when bookId does not match the question book', async () => {
  const state = emptyState({ questionBookId: '2dd8f4d8-22cf-4010-b6e7-99485683023c' });
  const response = await handleGrammarProgressPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID, result: 'correct' }),
    buildDeps(state),
  );
  assert.equal(response.status, 403);
  assert.equal(state.upserted.length, 0);
});

test('grammar/progress on correct marks mastered and records no miss', async () => {
  const state = emptyState();
  const response = await handleGrammarProgressPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID, result: 'correct' }),
    buildDeps(state),
  );
  assert.equal(response.status, 200);
  assert.equal(state.upserted[0].mastered, true);
  assert.equal(state.upserted[0].correct_count, 1);
  assert.equal(state.upserted[0].wrong_count, 0);
  assert.equal(state.missInserts.length, 0);
});

test('grammar/progress on wrong unsets mastered and records a miss', async () => {
  const state = emptyState({ existing: { correct_count: 2, wrong_count: 1 } });
  const response = await handleGrammarProgressPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID, result: 'wrong' }),
    buildDeps(state),
  );
  assert.equal(response.status, 200);
  assert.equal(state.upserted[0].mastered, false);
  assert.equal(state.upserted[0].correct_count, 2);
  assert.equal(state.upserted[0].wrong_count, 2);
  assert.equal(state.missInserts.length, 1);
  assert.equal(state.missInserts[0].question_id, QUESTION_ID);
});
