import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSearchSemanticPost } from '@/app/api/search/semantic/route';
import { handleQuiz2SimilarPost } from '@/app/api/quiz2/similar/route';
import { handleQuiz2SimilarBatchPost } from '@/app/api/quiz2/similar/batch/route';
import { handleSimilarCacheRebuildPost } from '@/app/api/similar-cache/rebuild/route';
import { POST as processLexiconEnrichmentPost } from '@/app/api/lexicon-enrichment/process/route';
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
    isFeatureEnabled: () => true,
  });

  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(rpcArgs?.['user_id_filter'], 'user-auth-1');
  assert.equal(Array.isArray(payload.results), true);
  assert.equal(payload.results[0].projectTitle, 'Animals');
});

test('quiz2 similar rejects unexpected userId field (strict schema)', async () => {
  let createClientCalled = false;
  const req = jsonRequest('http://localhost/api/quiz2/similar', {
    sourceWordId: '11111111-1111-4111-8111-111111111111',
    userId: 'another-user',
  });

  const res = await handleQuiz2SimilarPost(req, {
    createClient: async () => {
      createClientCalled = true;
      throw new Error('should not be called');
    },
    getAuthenticatedUserId: async () => 'user-auth-1',
    getSourceWord: async () => null,
    hasProjectOwnership: async () => false,
    matchSimilarWords: async () => [],
  });

  assert.equal(res.status, 400);
  assert.equal(createClientCalled, false);
});

test('quiz2 similar returns 401 when unauthenticated', async () => {
  const req = jsonRequest('http://localhost/api/quiz2/similar', {
    sourceWordId: '11111111-1111-4111-8111-111111111111',
  });

  const res = await handleQuiz2SimilarPost(req, {
    createClient: async () => ({}) as never,
    getAuthenticatedUserId: async () => null,
    getSourceWord: async () => null,
    hasProjectOwnership: async () => false,
    matchSimilarWords: async () => [],
  });

  assert.equal(res.status, 401);
});

test('quiz2 similar always uses authenticated user id', async () => {
  let argsFromMatch: Record<string, unknown> | null = null;
  const req = jsonRequest('http://localhost/api/quiz2/similar', {
    sourceWordId: '11111111-1111-4111-8111-111111111111',
    limit: 2,
  });

  const res = await handleQuiz2SimilarPost(req, {
    createClient: async () => ({}) as never,
    getAuthenticatedUserId: async () => 'user-auth-1',
    getSourceWord: async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      project_id: 'project-1',
      english: 'happy',
      japanese: '嬉しい',
      embedding: [0.1, 0.2, 0.3],
    }),
    hasProjectOwnership: async (_client, _projectId, userId) => userId === 'user-auth-1',
    matchSimilarWords: async (_client, args) => {
      argsFromMatch = {
        userId: args.userId,
        excludeWordIds: args.excludeWordIds,
        count: args.count,
      };
      return [
        { id: 'word-2', english: 'glad', japanese: 'うれしい', similarity: 0.92 },
      ];
    },
    isFeatureEnabled: () => true,
  });

  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(argsFromMatch?.['userId'], 'user-auth-1');
  assert.deepEqual(argsFromMatch?.['excludeWordIds'], ['11111111-1111-4111-8111-111111111111']);
  assert.equal(argsFromMatch?.['count'], 2);
  assert.equal(payload.results.length, 1);
});

test('quiz2 similar returns 403 when source word is not owned by user', async () => {
  const req = jsonRequest('http://localhost/api/quiz2/similar', {
    sourceWordId: '11111111-1111-4111-8111-111111111111',
  });

  const res = await handleQuiz2SimilarPost(req, {
    createClient: async () => ({}) as never,
    getAuthenticatedUserId: async () => 'user-auth-1',
    getSourceWord: async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      project_id: 'project-foreign',
      english: 'happy',
      japanese: '嬉しい',
      embedding: [0.1, 0.2, 0.3],
    }),
    hasProjectOwnership: async () => false,
    matchSimilarWords: async () => [],
  });

  assert.equal(res.status, 403);
});

test('quiz2 similar returns empty results when source word has no embedding', async () => {
  let matchCalled = false;
  const req = jsonRequest('http://localhost/api/quiz2/similar', {
    sourceWordId: '11111111-1111-4111-8111-111111111111',
  });

  const res = await handleQuiz2SimilarPost(req, {
    createClient: async () => ({}) as never,
    getAuthenticatedUserId: async () => 'user-auth-1',
    getSourceWord: async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      project_id: 'project-1',
      english: 'happy',
      japanese: '嬉しい',
      embedding: null,
    }),
    hasProjectOwnership: async () => true,
    matchSimilarWords: async () => {
      matchCalled = true;
      return [];
    },
    isFeatureEnabled: () => true,
  });

  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(matchCalled, false);
  assert.deepEqual(payload.results, []);
  assert.equal(payload.source, 'vector');
});

test('search semantic returns empty results when feature is disabled', async () => {
  let embeddingCalled = false;
  const req = jsonRequest('http://localhost/api/search/semantic', {
    query: 'dog',
  });

  const res = await handleSearchSemanticPost(req, {
    createClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-auth-1' } }, error: null }),
      },
    }) as never,
    generateEmbedding: async () => {
      embeddingCalled = true;
      return [0.1, 0.2, 0.3];
    },
    isFeatureEnabled: () => false,
  });

  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(embeddingCalled, false);
  assert.deepEqual(payload.results, []);
  assert.equal(payload.disabled, true);
});

test('quiz2 similar batch rejects unexpected userId field (strict schema)', async () => {
  let createClientCalled = false;
  const req = jsonRequest('http://localhost/api/quiz2/similar/batch', {
    sourceWordIds: ['11111111-1111-4111-8111-111111111111'],
    userId: 'another-user',
  });

  const res = await handleQuiz2SimilarBatchPost(req, {
    createClient: async () => {
      createClientCalled = true;
      throw new Error('should not be called');
    },
    getAuthenticatedUserId: async () => 'user-auth-1',
    getSourceWords: async () => [],
    getOwnedProjectIds: async () => new Set<string>(),
    getCachedRows: async () => [],
    getWordsByIds: async () => [],
    computeSimilarWords: async () => [],
    triggerSingleWordRebuild: () => undefined,
  });

  assert.equal(res.status, 400);
  assert.equal(createClientCalled, false);
});

test('quiz2 similar batch returns 401 when unauthenticated', async () => {
  const req = jsonRequest('http://localhost/api/quiz2/similar/batch', {
    sourceWordIds: ['11111111-1111-4111-8111-111111111111'],
  });

  const res = await handleQuiz2SimilarBatchPost(req, {
    createClient: async () => ({}) as never,
    getAuthenticatedUserId: async () => null,
    getSourceWords: async () => [],
    getOwnedProjectIds: async () => new Set<string>(),
    getCachedRows: async () => [],
    getWordsByIds: async () => [],
    computeSimilarWords: async () => [],
    triggerSingleWordRebuild: () => undefined,
  });

  assert.equal(res.status, 401);
});

test('quiz2 similar batch rejects words outside authenticated ownership', async () => {
  const req = jsonRequest('http://localhost/api/quiz2/similar/batch', {
    sourceWordIds: ['11111111-1111-4111-8111-111111111111'],
  });

  const res = await handleQuiz2SimilarBatchPost(req, {
    createClient: async () => ({}) as never,
    getAuthenticatedUserId: async () => 'user-auth-1',
    getSourceWords: async () => [{
      id: '11111111-1111-4111-8111-111111111111',
      project_id: 'foreign-project',
      english: 'happy',
      japanese: '嬉しい',
      embedding: [0.1, 0.2, 0.3],
    }],
    getOwnedProjectIds: async () => new Set<string>(['project-owned']),
    getCachedRows: async () => [],
    getWordsByIds: async () => [],
    computeSimilarWords: async () => [],
    triggerSingleWordRebuild: () => undefined,
  });

  assert.equal(res.status, 403);
});

test('similar-cache/rebuild returns 401 when service token is invalid', async () => {
  const req = jsonRequest('http://localhost/api/similar-cache/rebuild', {
    userId: '11111111-1111-4111-8111-111111111111',
    mode: 'single_word',
    sourceWordId: '22222222-2222-4222-8222-222222222222',
    newWordIds: [],
  });

  const res = await handleSimilarCacheRebuildPost(req, {
    getServiceRoleToken: () => 'service-key',
    createAdminClient: () => ({}) as never,
    fetchUserWords: async () => [],
    refreshCacheForSources: async () => 0,
    collectImpactedSourceIds: async () => [],
  });

  assert.equal(res.status, 401);
});

test('similar-cache/rebuild rejects unexpected fields (strict schema)', async () => {
  const req = jsonRequest(
    'http://localhost/api/similar-cache/rebuild',
    {
      userId: '11111111-1111-4111-8111-111111111111',
      mode: 'single_word',
      sourceWordId: '22222222-2222-4222-8222-222222222222',
      newWordIds: [],
      userIdFromClient: 'forbidden',
    },
    { authorization: 'Bearer service-key' },
  );

  const res = await handleSimilarCacheRebuildPost(req, {
    getServiceRoleToken: () => 'service-key',
    createAdminClient: () => ({}) as never,
    fetchUserWords: async () => [],
    refreshCacheForSources: async () => 0,
    collectImpactedSourceIds: async () => [],
  });

  assert.equal(res.status, 400);
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

test('lexicon-enrichment/process returns 401 when worker auth header is invalid', async () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
  try {
    const req = jsonRequest('http://localhost/api/lexicon-enrichment/process', {});
    const res = await processLexiconEnrichmentPost(req);
    assert.equal(res.status, 401);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('lexicon-enrichment/process returns 400 for non-uuid jobId', async () => {
  const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-test-key';
  try {
    const req = jsonRequest(
      'http://localhost/api/lexicon-enrichment/process',
      { jobId: 'not-a-uuid' },
      { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    );
    const res = await processLexiconEnrichmentPost(req);
    assert.equal(res.status, 400);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = original;
  }
});

test('lexicon-enrichment/process accepts INTERNAL_WORKER_TOKEN with normalized env value', async () => {
  await withWorkerEnv(
    {
      INTERNAL_WORKER_TOKEN: 'worker-test\n',
    },
    async () => {
      const req = jsonRequest(
        'http://localhost/api/lexicon-enrichment/process',
        { jobId: 'not-a-uuid' },
        { authorization: 'Bearer worker-test' },
      );
      const res = await processLexiconEnrichmentPost(req);
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
