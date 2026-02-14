import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSearchSemanticPost } from '@/app/api/search/semantic/route';
import { POST as processScanJobPost } from '@/app/api/scan-jobs/process/route';
import { POST as rebuildEmbeddingsPost } from '@/app/api/embeddings/rebuild/route';

function jsonRequest(url: string, body: unknown, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('search semantic rejects unexpected userId field (strict schema)', async () => {
  let createClientCalled = false;
  const req = jsonRequest('http://localhost/api/search/semantic', {
    query: 'dog',
    userId: 'another-user',
  });

  const res = await handleSearchSemanticPost(req, {
    createClient: async () => {
      createClientCalled = true;
      throw new Error('should not be called');
    },
    generateEmbedding: async () => [0.1, 0.2, 0.3],
  });

  assert.equal(res.status, 400);
  assert.equal(createClientCalled, false);
});

test('search semantic returns 401 when unauthenticated', async () => {
  const req = jsonRequest('http://localhost/api/search/semantic', {
    query: 'dog',
  });

  const res = await handleSearchSemanticPost(req, {
    createClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }) as never,
    generateEmbedding: async () => [0.1, 0.2, 0.3],
  });

  assert.equal(res.status, 401);
});

test('search semantic always uses authenticated user id', async () => {
  let rpcArgs: Record<string, unknown> | null = null;
  const req = jsonRequest('http://localhost/api/search/semantic', {
    query: 'dog',
  });

  const res = await handleSearchSemanticPost(req, {
    createClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-auth-1' } }, error: null }),
      },
      rpc: async (_name: string, args: Record<string, unknown>) => {
        rpcArgs = args;
        return {
          data: [
            {
              id: 'word-1',
              project_id: 'project-1',
              english: 'dog',
              japanese: '犬',
              similarity: 0.91,
            },
          ],
          error: null,
        };
      },
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [{ id: 'project-1', title: 'Animals' }],
          }),
        }),
      }),
    }) as never,
    generateEmbedding: async () => [0.1, 0.2, 0.3],
  });

  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(rpcArgs?.user_id_filter, 'user-auth-1');
  assert.equal(Array.isArray(payload.results), true);
  assert.equal(payload.results[0].projectTitle, 'Animals');
});

test('scan-jobs/process returns 401 when worker auth header is invalid', async () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
  try {
    const req = jsonRequest('http://localhost/api/scan-jobs/process', { jobId: '0dd8f4d8-22cf-4010-b6e7-99485683023c' });
    const res = await processScanJobPost(req);
    assert.equal(res.status, 401);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('scan-jobs/process returns 400 for non-uuid jobId', async () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
  try {
    const req = jsonRequest(
      'http://localhost/api/scan-jobs/process',
      { jobId: 'not-a-uuid' },
      { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    );
    const res = await processScanJobPost(req);
    assert.equal(res.status, 400);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('embeddings/rebuild returns 401 without admin header', async () => {
  const original = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = 'admin-secret';
  try {
    const req = jsonRequest('http://localhost/api/embeddings/rebuild', {});
    const res = await rebuildEmbeddingsPost(req);
    assert.equal(res.status, 401);
  } finally {
    process.env.ADMIN_SECRET = original;
  }
});

test('embeddings/rebuild returns 400 for blank admin header', async () => {
  const original = process.env.ADMIN_SECRET;
  process.env.ADMIN_SECRET = 'admin-secret';
  try {
    const req = jsonRequest('http://localhost/api/embeddings/rebuild', {}, { 'x-admin-secret': '   ' });
    const res = await rebuildEmbeddingsPost(req);
    assert.equal(res.status, 400);
  } finally {
    process.env.ADMIN_SECRET = original;
  }
});
