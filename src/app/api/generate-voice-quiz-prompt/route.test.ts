import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { handleGenerateVoiceQuizPromptPost } from './route';

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/generate-voice-quiz-prompt', {
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

test('generate-voice-quiz-prompt requires an authenticated user', async () => {
  const response = await handleGenerateVoiceQuizPromptPost(
    jsonRequest({ words: [{ id: 'word-1', english: 'clarify', japanese: '明確にする' }] }),
    {
      createClient: async () => createClient(null) as never,
      generate: async () => [],
    },
  );

  assert.equal(response.status, 401);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.success, false);
});

test('generate-voice-quiz-prompt validates request body before generation', async () => {
  const response = await handleGenerateVoiceQuizPromptPost(
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

test('generate-voice-quiz-prompt returns generated prompts', async () => {
  const calls: unknown[] = [];
  const response = await handleGenerateVoiceQuizPromptPost(
    jsonRequest(
      { words: [{ id: 'word-1', english: 'clarify', japanese: '明確にする' }] },
      { authorization: 'Bearer token-1' },
    ),
    {
      createClient: async () => createClient() as never,
      generate: async (words) => {
        calls.push(words);
        return [{ wordId: 'word-1', prompt: '「明確にする」という意味の単語、英語で何と言う?' }];
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[{ id: 'word-1', english: 'clarify', japanese: '明確にする' }]]);
  const payload = await response.json() as {
    success: boolean;
    results: Array<{ wordId: string; prompt: string }>;
  };
  assert.equal(payload.success, true);
  assert.equal(payload.results[0]?.wordId, 'word-1');
});
