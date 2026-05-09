import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { WORD_ORDER_BLANK_TOKEN, WORD_ORDER_CACHE_VERSION } from '@/lib/quiz/word-order';
import { handleGenerateWordOrderQuizPost } from './route';

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/generate-word-order-quiz', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createClient(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: {
      getUser: async (token?: string) => ({
        data: { user },
        error: null,
        token,
      }),
    },
  };
}

test('generate-word-order-quiz requires an authenticated user', async () => {
  const response = await handleGenerateWordOrderQuizPost(
    jsonRequest({ words: [{ id: 'word-1', english: 'take care', japanese: '世話をする' }] }),
    {
      createClient: async () => createClient(null) as never,
      generate: async () => [],
    },
  );

  assert.equal(response.status, 401);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.success, false);
});

test('generate-word-order-quiz validates request body before generation', async () => {
  const response = await handleGenerateWordOrderQuizPost(
    jsonRequest({ words: [] }),
    {
      createClient: async () => createClient() as never,
      generate: async () => {
        throw new Error('generate should not run');
      },
    },
  );

  assert.equal(response.status, 400);
});

test('generate-word-order-quiz returns generated cache results', async () => {
  const calls: unknown[] = [];
  const response = await handleGenerateWordOrderQuizPost(
    jsonRequest(
      { words: [{ id: 'word-1', english: 'take care', japanese: '世話をする' }] },
      { authorization: 'Bearer token-1' },
    ),
    {
      createClient: async () => createClient() as never,
      generate: async (words) => {
        calls.push(words);
        return [
          {
            wordId: 'word-1',
            quiz: {
              version: WORD_ORDER_CACHE_VERSION,
              sourceEnglish: 'take care',
              sourceJapanese: '世話をする',
              sentenceTokens: [WORD_ORDER_BLANK_TOKEN, WORD_ORDER_BLANK_TOKEN],
              answerTokens: ['take', 'care'],
              decoyTokens: ['hold', 'keep', 'watch'],
              generatedAt: '2026-05-09T00:00:00.000Z',
            },
          },
        ];
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[{ id: 'word-1', english: 'take care', japanese: '世話をする' }]]);
  const payload = await response.json() as {
    success: boolean;
    results: Array<{ wordId: string }>;
  };
  assert.equal(payload.success, true);
  assert.equal(payload.results[0]?.wordId, 'word-1');
});
