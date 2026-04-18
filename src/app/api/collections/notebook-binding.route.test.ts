import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleCollectionNotebookBindingGet, handleCollectionNotebookBindingPost } from './[id]/notebook-binding/route';
import { handleCollectionNotebookBindingPatch } from './[id]/notebook-binding/[bindingId]/route';

function jsonRequest(url: string, method: 'POST' | 'PATCH', body: unknown) {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const binding = {
  id: '6e37d962-1a83-4fd2-87fe-c0c0839a108d',
  collectionId: '67d5db85-cdbc-4a1c-a321-4b4f0a0a9ec0',
  wordbookAssetId: 'd735d602-a72e-4c30-9d30-ccfa7d4a6f0a',
  structureAssetId: '0bd2cce8-c7f1-41de-91e1-2450d7090ed7',
  correctionAssetId: '1349a4ee-57f2-4951-890f-3f984225fa2e',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
};

test('collections/[id]/notebook-binding GET returns binding by wordbook asset', async () => {
  const res = await handleCollectionNotebookBindingGet(
    new NextRequest(`http://localhost/api/collections/${binding.collectionId}/notebook-binding?wordbookAssetId=${binding.wordbookAssetId}`),
    { id: binding.collectionId },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getBinding: async () => binding,
    },
  );

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.binding.wordbookAssetId, binding.wordbookAssetId);
  assert.equal(payload.binding.structureAssetId, binding.structureAssetId);
});

test('collections/[id]/notebook-binding POST creates a binding', async () => {
  const res = await handleCollectionNotebookBindingPost(
    jsonRequest(`http://localhost/api/collections/${binding.collectionId}/notebook-binding`, 'POST', {
      wordbookAssetId: binding.wordbookAssetId,
      structureAssetId: binding.structureAssetId,
    }),
    { id: binding.collectionId },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      createBinding: async () => binding,
    },
  );

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.binding.id, binding.id);
});

test('collections/[id]/notebook-binding/[bindingId] PATCH updates a binding', async () => {
  const res = await handleCollectionNotebookBindingPatch(
    jsonRequest(`http://localhost/api/collections/${binding.collectionId}/notebook-binding/${binding.id}`, 'PATCH', {
      correctionAssetId: binding.correctionAssetId,
    }),
    { id: binding.collectionId, bindingId: binding.id },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      updateBinding: async () => binding,
    },
  );

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.binding.correctionAssetId, binding.correctionAssetId);
});
