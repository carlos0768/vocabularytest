import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import {
  POST as processWordLexiconResolutionPost,
  handleWordLexiconResolutionProcessPost,
} from '@/app/api/word-lexicon-resolution/process/route';
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

async function withWorkerEnv<T>(
  values: {
    SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
    INTERNAL_WORKER_TOKEN?: string | undefined;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalInternalWorkerToken = process.env.INTERNAL_WORKER_TOKEN;

  if (typeof values.SUPABASE_SERVICE_ROLE_KEY === 'string') {
    process.env.SUPABASE_SERVICE_ROLE_KEY = values.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  if (typeof values.INTERNAL_WORKER_TOKEN === 'string') {
    process.env.INTERNAL_WORKER_TOKEN = values.INTERNAL_WORKER_TOKEN;
  } else {
    delete process.env.INTERNAL_WORKER_TOKEN;
  }

  try {
    return await fn();
  } finally {
    if (typeof originalServiceRoleKey === 'string') {
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    } else {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }

    if (typeof originalInternalWorkerToken === 'string') {
      process.env.INTERNAL_WORKER_TOKEN = originalInternalWorkerToken;
    } else {
      delete process.env.INTERNAL_WORKER_TOKEN;
    }
  }
}

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

test('scan-jobs/process accepts INTERNAL_WORKER_TOKEN with normalized env value', async () => {
  await withWorkerEnv(
    {
      INTERNAL_WORKER_TOKEN: 'worker-test\n',
    },
    async () => {
      const req = jsonRequest(
        'http://localhost/api/scan-jobs/process',
        { jobId: 'not-a-uuid' },
        { authorization: 'Bearer worker-test' },
      );
      const res = await processScanJobPost(req);
      assert.equal(res.status, 400);
    },
  );
});

test('word-lexicon-resolution/process returns 401 when worker auth header is invalid', async () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
  try {
    const req = jsonRequest('http://localhost/api/word-lexicon-resolution/process', {});
    const res = await processWordLexiconResolutionPost(req);
    assert.equal(res.status, 401);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('word-lexicon-resolution/process returns 400 for non-uuid jobId', async () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
  try {
    const req = jsonRequest(
      'http://localhost/api/word-lexicon-resolution/process',
      { jobId: 'not-a-uuid' },
      { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    );
    const res = await processWordLexiconResolutionPost(req);
    assert.equal(res.status, 400);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('word-lexicon-resolution/process accepts INTERNAL_WORKER_TOKEN and returns processed=0 when no jobs are claimed', async () => {
  await withWorkerEnv(
    {
      INTERNAL_WORKER_TOKEN: 'worker-test\n',
    },
    async () => {
      const req = jsonRequest(
        'http://localhost/api/word-lexicon-resolution/process',
        { jobId: '0dd8f4d8-22cf-4010-b6e7-99485683023c' },
        { authorization: 'Bearer worker-test' },
      );
      const res = await handleWordLexiconResolutionProcessPost(req, {
        supabaseAdmin: {
          from: () => ({
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        } as never,
      });

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        success: true,
        processed: 0,
      });
    },
  );
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
