import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleGrammarQuestionDelete } from '@/app/api/grammar/questions/[questionId]/route';
import type { requireProUser } from '@/lib/api/pro-auth';

type FakeState = {
  ownedQuestionIds?: string[];
  deletedIds?: string[];
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table !== 'grammar_questions') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        delete: () => ({
          eq: (_column: string, questionId: string) => ({
            // 2つ目の eq は user_id 縛り。所有者以外には行が返らない想定。
            eq: () => ({
              select: async () => {
                if (!(state.ownedQuestionIds ?? []).includes(questionId)) {
                  return { data: [], error: null };
                }
                state.deletedIds?.push(questionId);
                return { data: [{ id: questionId }], error: null };
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

function deleteRequest(questionId: string) {
  return new NextRequest(`http://localhost/api/grammar/questions/${questionId}`, { method: 'DELETE' });
}

function contextFor(questionId: string) {
  return { params: Promise.resolve({ questionId }) };
}

const QUESTION_ID = '2b7d5f10-9c31-4a88-b0d6-7e5c4a3b2109';

test('grammar question DELETE returns the pro-gate response for non-Pro users', async () => {
  const response = await handleGrammarQuestionDelete(
    deleteRequest(QUESTION_ID),
    contextFor(QUESTION_ID),
    buildDeps({}, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );

  assert.equal(response.status, 403);
});

test('grammar question DELETE returns 400 for a non-uuid question id', async () => {
  const response = await handleGrammarQuestionDelete(
    deleteRequest('not-a-uuid'),
    contextFor('not-a-uuid'),
    buildDeps({ ownedQuestionIds: [QUESTION_ID] }),
  );

  assert.equal(response.status, 400);
});

test('grammar question DELETE removes an owned question', async () => {
  const state: FakeState = { ownedQuestionIds: [QUESTION_ID], deletedIds: [] };

  const response = await handleGrammarQuestionDelete(
    deleteRequest(QUESTION_ID),
    contextFor(QUESTION_ID),
    buildDeps(state),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.deepEqual(state.deletedIds, [QUESTION_ID]);
});

test('grammar question DELETE returns 404 when the question belongs to someone else', async () => {
  const state: FakeState = { ownedQuestionIds: [], deletedIds: [] };

  const response = await handleGrammarQuestionDelete(
    deleteRequest(QUESTION_ID),
    contextFor(QUESTION_ID),
    buildDeps(state),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(state.deletedIds, []);
});
