import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSharedProjectSharedTagsPatch } from './[projectId]/shared-tags/route';

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/shared-projects/project-1/shared-tags', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('shared project tags PATCH rejects tags without slash prefix', async () => {
  const res = await handleSharedProjectSharedTagsPatch(
    jsonRequest({ sharedTags: ['TOEIC'] }),
    { params: Promise.resolve({ projectId: 'project-1' }) },
    {
      requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'user-1' } as never }),
    },
  );

  assert.equal(res.status, 400);
});

test('shared project tags PATCH saves normalized tags with embedding', async () => {
  let embeddingInput: string[] = [];
  let updateArgs: unknown[] = [];

  const res = await handleSharedProjectSharedTagsPatch(
    jsonRequest({ sharedTags: ['/TOEIC', '／熟語'] }),
    { params: Promise.resolve({ projectId: 'project-1' }) },
    {
      requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'user-1' } as never }),
      createSharedTagsEmbedding: async (tags) => {
        embeddingInput = [...tags];
        return [0.1, 0.2, 0.3];
      },
      updateProjectSharedTags: async (...args) => {
        updateArgs = args;
        return args[2];
      },
    },
  );

  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(payload.sharedTags, ['TOEIC', '熟語']);
  assert.deepEqual(embeddingInput, ['TOEIC', '熟語']);
  assert.deepEqual(updateArgs, ['project-1', 'user-1', ['TOEIC', '熟語'], [0.1, 0.2, 0.3]]);
});
