import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import {
  aggregateGrammarMisses,
  handleChatGptGrammarMissesGet,
  handleChatGptGrammarMissesPost,
} from '@/app/api/chatgpt/grammar-misses/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const QUESTION_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';
const BOOK_ID = '1dd8f4d8-22cf-4010-b6e7-99485683023c';

type FakeState = {
  ownsQuestion: boolean;
  insertedRows: Record<string, unknown>[];
  missRows?: { question_id: string; created_at: string }[];
  questionRows?: Record<string, unknown>[];
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'grammar_questions') {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              // POST: .eq('id').eq('user_id').maybeSingle()
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.ownsQuestion ? { id: value } : null,
                  error: null,
                }),
              }),
              // GET: .eq('user_id').in('id', ids)
              in: async () => ({ data: state.questionRows ?? [], error: null }),
            }),
          }),
        };
      }
      if (table === 'grammar_question_misses') {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.insertedRows.push(row);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: state.missRows ?? [], error: null }),
              }),
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

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/chatgpt/grammar-misses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(query = '') {
  return new NextRequest(`http://localhost/api/chatgpt/grammar-misses${query}`, { method: 'GET' });
}

test('aggregateGrammarMisses counts per question and sorts by count then recency', () => {
  const rows = [
    { question_id: 'q1', created_at: '2026-07-23T10:00:00Z' },
    { question_id: 'q2', created_at: '2026-07-23T09:00:00Z' },
    { question_id: 'q1', created_at: '2026-07-22T09:00:00Z' },
  ];
  const aggregated = aggregateGrammarMisses(rows);
  assert.deepEqual(aggregated.map((m) => m.questionId), ['q1', 'q2']);
  assert.equal(aggregated[0].missCount, 2);
  assert.equal(aggregated[0].lastMissedAt, '2026-07-23T10:00:00Z');
});

test('grammar-misses POST returns the pro-gate response for non-Pro users', async () => {
  const state: FakeState = { ownsQuestion: true, insertedRows: [] };
  const response = await handleChatGptGrammarMissesPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID }),
    buildDeps(state, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(state.insertedRows.length, 0);
});

test('grammar-misses POST rejects a question the user does not own', async () => {
  const state: FakeState = { ownsQuestion: false, insertedRows: [] };
  const response = await handleChatGptGrammarMissesPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID }),
    buildDeps(state),
  );
  assert.equal(response.status, 403);
  assert.equal(state.insertedRows.length, 0);
});

test('grammar-misses POST records a miss row', async () => {
  const state: FakeState = { ownsQuestion: true, insertedRows: [] };
  const response = await handleChatGptGrammarMissesPost(
    postRequest({ questionId: QUESTION_ID, bookId: BOOK_ID }),
    buildDeps(state),
  );
  assert.equal(response.status, 200);
  assert.equal(state.insertedRows.length, 1);
  assert.equal(state.insertedRows[0].user_id, 'user-1');
  assert.equal(state.insertedRows[0].question_id, QUESTION_ID);
  assert.equal(state.insertedRows[0].book_id, BOOK_ID);
});

test('grammar-misses GET returns questions joined with miss counts', async () => {
  const state: FakeState = {
    ownsQuestion: true,
    insertedRows: [],
    missRows: [
      { question_id: QUESTION_ID, created_at: '2026-07-23T10:00:00Z' },
      { question_id: QUESTION_ID, created_at: '2026-07-22T09:00:00Z' },
    ],
    questionRows: [
      {
        id: QUESTION_ID,
        book_id: BOOK_ID,
        sentence: 'She insisted that he ___ the meeting.',
        choices: ['attend', 'attends', 'attended', 'would attend'],
        correct_index: 0,
        explanation: 'insist that の後は動詞の原形。',
        grammar_point: '仮定法現在',
        sentence_ja: null,
      },
    ],
  };
  const response = await handleChatGptGrammarMissesGet(getRequest('?limit=5'), buildDeps(state));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.questions.length, 1);
  assert.equal(payload.questions[0].missCount, 2);
  assert.equal(payload.questions[0].correctIndex, 0);
  assert.equal(payload.questions[0].explanation, 'insist that の後は動詞の原形。');
});

test('grammar-misses GET returns an empty list when there are no misses', async () => {
  const state: FakeState = { ownsQuestion: true, insertedRows: [], missRows: [] };
  const response = await handleChatGptGrammarMissesGet(getRequest(), buildDeps(state));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.questions, []);
  assert.equal(payload.totalCount, 0);
});
