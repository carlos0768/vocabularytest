import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest, NextResponse } from 'next/server';

import { handleChatGptWordsPost } from '@/app/api/chatgpt/words/route';
import {
  handleChatGptProjectsGet,
  handleChatGptProjectsPost,
} from '@/app/api/chatgpt/projects/route';
import { handleChatGptStrugglingWordsGet } from '@/app/api/chatgpt/struggling-words/route';
import {
  handleChatGptGrammarBooksGet,
  handleChatGptGrammarBooksPost,
} from '@/app/api/chatgpt/grammar-books/route';
import {
  handleChatGptGrammarQuestionsGet,
  handleChatGptGrammarQuestionsPost,
} from '@/app/api/chatgpt/grammar-questions/route';
import type { requireProUser } from '@/lib/api/pro-auth';

const unauthorizedGate = (async () => ({
  ok: false as const,
  response: NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 }),
})) as unknown as typeof requireProUser;

const proGate = (async () => ({
  ok: false as const,
  response: NextResponse.json(
    { success: false, error: 'この機能はPro限定です。', code: 'PRO_REQUIRED' },
    { status: 403 },
  ),
})) as unknown as typeof requireProUser;

const authedGate = (async () => ({
  ok: true as const,
  supabase: new Proxy({}, {
    get() {
      throw new Error('supabase must not be touched for malformed requests');
    },
  }),
  user: { id: 'user-1' },
})) as unknown as typeof requireProUser;

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('chatgpt/words rejects unauthenticated requests with 401', async () => {
  const response = await handleChatGptWordsPost(
    jsonRequest('http://localhost/api/chatgpt/words', { words: [] }),
    { requirePro: unauthorizedGate },
  );
  assert.equal(response.status, 401);
});

test('chatgpt/words rejects non-Pro users with 403', async () => {
  const response = await handleChatGptWordsPost(
    jsonRequest('http://localhost/api/chatgpt/words', { words: [] }),
    { requirePro: proGate },
  );
  assert.equal(response.status, 403);
});

test('chatgpt/words rejects malformed bodies with 400 before touching data', async () => {
  const response = await handleChatGptWordsPost(
    jsonRequest('http://localhost/api/chatgpt/words', { words: [], extra: true }),
    { requirePro: authedGate },
  );
  assert.equal(response.status, 400);
});

test('chatgpt/projects GET rejects unauthenticated requests with 401', async () => {
  const response = await handleChatGptProjectsGet(
    new NextRequest('http://localhost/api/chatgpt/projects', { method: 'GET' }),
    { requirePro: unauthorizedGate },
  );
  assert.equal(response.status, 401);
});

test('chatgpt/projects POST rejects non-Pro users with 403', async () => {
  const response = await handleChatGptProjectsPost(
    jsonRequest('http://localhost/api/chatgpt/projects', { title: 'x' }),
    { requirePro: proGate },
  );
  assert.equal(response.status, 403);
});

test('chatgpt/projects POST rejects malformed bodies with 400 before touching data', async () => {
  const response = await handleChatGptProjectsPost(
    jsonRequest('http://localhost/api/chatgpt/projects', { title: '' }),
    { requirePro: authedGate },
  );
  assert.equal(response.status, 400);
});

test('chatgpt/struggling-words rejects unauthenticated requests with 401', async () => {
  const response = await handleChatGptStrugglingWordsGet(
    new NextRequest('http://localhost/api/chatgpt/struggling-words', { method: 'GET' }),
    { requirePro: unauthorizedGate },
  );
  assert.equal(response.status, 401);
});

test('chatgpt/struggling-words rejects non-Pro users with 403', async () => {
  const response = await handleChatGptStrugglingWordsGet(
    new NextRequest('http://localhost/api/chatgpt/struggling-words', { method: 'GET' }),
    { requirePro: proGate },
  );
  assert.equal(response.status, 403);
});

test('chatgpt/struggling-words rejects invalid query params with 400 before touching data', async () => {
  const response = await handleChatGptStrugglingWordsGet(
    new NextRequest('http://localhost/api/chatgpt/struggling-words?limit=abc', { method: 'GET' }),
    { requirePro: authedGate },
  );
  assert.equal(response.status, 400);
});

test('chatgpt/grammar-books GET rejects unauthenticated requests with 401', async () => {
  const response = await handleChatGptGrammarBooksGet(
    new NextRequest('http://localhost/api/chatgpt/grammar-books', { method: 'GET' }),
    { requirePro: unauthorizedGate },
  );
  assert.equal(response.status, 401);
});

test('chatgpt/grammar-books POST rejects non-Pro users with 403', async () => {
  const response = await handleChatGptGrammarBooksPost(
    jsonRequest('http://localhost/api/chatgpt/grammar-books', { title: 'x' }),
    { requirePro: proGate },
  );
  assert.equal(response.status, 403);
});

test('chatgpt/grammar-books POST rejects malformed bodies with 400 before touching data', async () => {
  const response = await handleChatGptGrammarBooksPost(
    jsonRequest('http://localhost/api/chatgpt/grammar-books', { title: '' }),
    { requirePro: authedGate },
  );
  assert.equal(response.status, 400);
});

test('chatgpt/grammar-questions POST rejects unauthenticated requests with 401', async () => {
  const response = await handleChatGptGrammarQuestionsPost(
    jsonRequest('http://localhost/api/chatgpt/grammar-questions', { bookId: 'x', questions: [] }),
    { requirePro: unauthorizedGate },
  );
  assert.equal(response.status, 401);
});

test('chatgpt/grammar-questions POST rejects malformed bodies with 400 before touching data', async () => {
  const response = await handleChatGptGrammarQuestionsPost(
    jsonRequest('http://localhost/api/chatgpt/grammar-questions', { bookId: 'not-a-uuid', questions: [] }),
    { requirePro: authedGate },
  );
  assert.equal(response.status, 400);
});

test('chatgpt/grammar-questions GET rejects non-Pro users with 403', async () => {
  const response = await handleChatGptGrammarQuestionsGet(
    new NextRequest('http://localhost/api/chatgpt/grammar-questions?bookId=0dd8f4d8-22cf-4010-b6e7-99485683023c', { method: 'GET' }),
    { requirePro: proGate },
  );
  assert.equal(response.status, 403);
});
