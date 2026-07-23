import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import {
  handleChatGptGrammarQuestionsGet,
  handleChatGptGrammarQuestionsPost,
} from '@/app/api/chatgpt/grammar-questions/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const BOOK_ID = '0dd8f4d8-22cf-4010-b6e7-99485683023c';

const VALID_QUESTION = {
  sentence: 'She insisted that he ___ the meeting.',
  choices: ['attend', 'attends', 'attended', 'would attend'],
  correctIndex: 0,
  explanation: 'insist that の後は仮定法現在で動詞の原形を使う。主語が he でも attends にはならない。',
  grammarPoint: '仮定法現在',
  sentenceJa: '彼女は彼がその会議に出席するべきだと主張した。',
};

type FakeState = {
  ownsBook: boolean;
  insertedRows: Record<string, unknown>[][];
  questionRows?: Record<string, unknown>[];
};

function buildFakeSupabase(state: FakeState) {
  return {
    from(table: string) {
      if (table === 'grammar_books') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: state.ownsBook ? { id: BOOK_ID } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'grammar_questions') {
        return {
          insert: (rows: Record<string, unknown>[]) => ({
            select: async () => {
              state.insertedRows.push(rows);
              return { data: rows.map((_, index) => ({ id: `q-${index}` })), error: null };
            },
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: state.questionRows ?? [], error: null }),
                }),
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
  return new NextRequest('http://localhost/api/chatgpt/grammar-questions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(query: string) {
  return new NextRequest(`http://localhost/api/chatgpt/grammar-questions${query}`, { method: 'GET' });
}

test('grammar-questions POST returns the pro-gate response for non-Pro users', async () => {
  const state: FakeState = { ownsBook: true, insertedRows: [] };
  const response = await handleChatGptGrammarQuestionsPost(
    postRequest({ bookId: BOOK_ID, questions: [VALID_QUESTION] }),
    buildDeps(state, {
      proFailure: NextResponse.json({ success: false, error: 'この機能はPro限定です。' }, { status: 403 }),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(state.insertedRows.length, 0);
});

test('grammar-questions POST rejects a sentence without the blank marker', async () => {
  const state: FakeState = { ownsBook: true, insertedRows: [] };
  const response = await handleChatGptGrammarQuestionsPost(
    postRequest({
      bookId: BOOK_ID,
      questions: [{ ...VALID_QUESTION, sentence: 'She insisted that he attend the meeting.' }],
    }),
    buildDeps(state),
  );
  assert.equal(response.status, 400);
  assert.equal(state.insertedRows.length, 0);
});

test('grammar-questions POST rejects duplicate choices', async () => {
  const state: FakeState = { ownsBook: true, insertedRows: [] };
  const response = await handleChatGptGrammarQuestionsPost(
    postRequest({
      bookId: BOOK_ID,
      questions: [{ ...VALID_QUESTION, choices: ['attend', 'Attend', 'attended', 'would attend'] }],
    }),
    buildDeps(state),
  );
  assert.equal(response.status, 400);
});

test('grammar-questions POST rejects a missing explanation', async () => {
  const state: FakeState = { ownsBook: true, insertedRows: [] };
  const { explanation: _explanation, ...withoutExplanation } = VALID_QUESTION;
  const response = await handleChatGptGrammarQuestionsPost(
    postRequest({ bookId: BOOK_ID, questions: [withoutExplanation] }),
    buildDeps(state),
  );
  assert.equal(response.status, 400);
});

test('grammar-questions POST returns 403 for a book the user does not own', async () => {
  const state: FakeState = { ownsBook: false, insertedRows: [] };
  const response = await handleChatGptGrammarQuestionsPost(
    postRequest({ bookId: BOOK_ID, questions: [VALID_QUESTION] }),
    buildDeps(state),
  );
  assert.equal(response.status, 403);
  assert.equal(state.insertedRows.length, 0);
});

test('grammar-questions POST inserts rows with explanation and choices', async () => {
  const state: FakeState = { ownsBook: true, insertedRows: [] };
  const response = await handleChatGptGrammarQuestionsPost(
    postRequest({ bookId: BOOK_ID, questions: [VALID_QUESTION] }),
    buildDeps(state),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.addedCount, 1);

  const row = state.insertedRows[0][0];
  assert.equal(row.book_id, BOOK_ID);
  assert.equal(row.user_id, 'user-1');
  assert.equal(row.correct_index, 0);
  assert.deepEqual(row.choices, VALID_QUESTION.choices);
  assert.equal(row.explanation, VALID_QUESTION.explanation);
  assert.equal(row.grammar_point, '仮定法現在');
});

test('grammar-questions GET returns questions in camelCase', async () => {
  const state: FakeState = {
    ownsBook: true,
    insertedRows: [],
    questionRows: [
      {
        id: 'q1',
        sentence: VALID_QUESTION.sentence,
        choices: VALID_QUESTION.choices,
        correct_index: 0,
        explanation: VALID_QUESTION.explanation,
        grammar_point: '仮定法現在',
        sentence_ja: VALID_QUESTION.sentenceJa,
      },
    ],
  };
  const response = await handleChatGptGrammarQuestionsGet(
    getRequest(`?bookId=${BOOK_ID}&limit=10`),
    buildDeps(state),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.questions.length, 1);
  assert.equal(payload.questions[0].correctIndex, 0);
  assert.equal(payload.questions[0].grammarPoint, '仮定法現在');
  assert.equal(payload.questions[0].explanation, VALID_QUESTION.explanation);
});

test('grammar-questions GET requires a bookId', async () => {
  const response = await handleChatGptGrammarQuestionsGet(
    getRequest(''),
    buildDeps({ ownsBook: true, insertedRows: [] }),
  );
  assert.equal(response.status, 400);
});

test('grammar-questions GET returns 403 for a book the user does not own', async () => {
  const response = await handleChatGptGrammarQuestionsGet(
    getRequest(`?bookId=${BOOK_ID}`),
    buildDeps({ ownsBook: false, insertedRows: [] }),
  );
  assert.equal(response.status, 403);
});
