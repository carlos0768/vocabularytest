import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { handleParaphraseLookupPost } from './route';

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/paraphrase/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function createClient(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  };
}

const sources = () => [{ name: 'Open English WordNet', license: 'CC BY 4.0', url: 'https://example.test' }];

test('paraphrase lookup requires an authenticated user', async () => {
  const response = await handleParaphraseLookupPost(
    jsonRequest({ words: [{ id: 'w1', english: 'plummet' }] }),
    {
      createClient: async () => createClient(null) as never,
      lookup: () => { throw new Error('lookup should not run'); },
      sources,
    },
  );
  assert.equal(response.status, 401);
});

test('paraphrase lookup validates the body before looking anything up', async () => {
  const response = await handleParaphraseLookupPost(
    jsonRequest({ words: [] }),
    {
      createClient: async () => createClient() as never,
      lookup: () => { throw new Error('lookup should not run'); },
      sources,
    },
  );
  assert.equal(response.status, 400);
});

test('paraphrase lookup returns only the words that have material, with attribution', async () => {
  const response = await handleParaphraseLookupPost(
    jsonRequest({ words: [
      { id: 'w1', english: 'plummet', partOfSpeechTags: ['verb'] },
      { id: 'w2', english: 'xyzzy' },
    ] }),
    {
      createClient: async () => createClient() as never,
      lookup: (words) => words
        .filter((word) => word.english === 'plummet')
        .map((word) => ({
          wordId: word.id,
          headword: 'plummet',
          pos: 'v' as const,
          answers: ['drop', 'decline'],
          distractors: ['wish', 'abuse', 'leaf', 'pioneer'],
        })),
      sources,
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json() as {
    success: boolean;
    results: Array<{ wordId: string; answers: string[] }>;
    sources: Array<{ name: string }>;
  };
  assert.equal(payload.success, true);
  assert.deepEqual(payload.results.map((result) => result.wordId), ['w1']);
  assert.deepEqual(payload.results[0].answers, ['drop', 'decline']);
  assert.equal(payload.sources[0].name, 'Open English WordNet');
});

test('paraphrase lookup rejects unknown fields and oversized batches', async () => {
  const unknownField = await handleParaphraseLookupPost(
    jsonRequest({ words: [{ id: 'w1', english: 'plummet', japanese: '急落する' }] }),
    { createClient: async () => createClient() as never, lookup: () => [], sources },
  );
  assert.equal(unknownField.status, 400);

  const tooMany = await handleParaphraseLookupPost(
    jsonRequest({ words: Array.from({ length: 501 }, (_, i) => ({ id: `w${i}`, english: 'word' })) }),
    { createClient: async () => createClient() as never, lookup: () => [], sources },
  );
  assert.equal(tooMany.status, 400);
});
