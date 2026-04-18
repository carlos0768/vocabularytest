import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleCollectionItemsGet } from './[id]/items/route';

test('collections/[id]/items GET returns mixed asset kinds in order', async () => {
  const res = await handleCollectionItemsGet(
    new NextRequest('http://localhost/api/collections/collection-1/items', { method: 'GET' }),
    { id: 'collection-1' },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      listItems: async () => ([
        {
          collectionId: 'collection-1',
          assetId: 'asset-vocab',
          sortOrder: 0,
          addedAt: '2026-04-18T00:00:00.000Z',
          asset: {
            id: 'asset-vocab',
            userId: 'user-1',
            kind: 'vocabulary_project',
            title: '単語帳',
            status: 'ready',
            legacyProjectId: 'project-1',
            createdAt: '2026-04-18T00:00:00.000Z',
            updatedAt: '2026-04-18T00:00:00.000Z',
          },
          project: {
            id: 'project-1',
            title: '単語帳',
            sourceLabels: ['lesson-1'],
            createdAt: '2026-04-18T00:00:00.000Z',
          },
        },
        {
          collectionId: 'collection-1',
          assetId: 'asset-structure',
          sortOrder: 1,
          addedAt: '2026-04-18T00:00:00.000Z',
          asset: {
            id: 'asset-structure',
            userId: 'user-1',
            kind: 'structure_document',
            title: '構造解析',
            status: 'ready',
            createdAt: '2026-04-18T00:00:00.000Z',
            updatedAt: '2026-04-18T00:00:00.000Z',
          },
        },
        {
          collectionId: 'collection-1',
          assetId: 'asset-correction',
          sortOrder: 2,
          addedAt: '2026-04-18T00:00:00.000Z',
          asset: {
            id: 'asset-correction',
            userId: 'user-1',
            kind: 'correction_document',
            title: '添削',
            status: 'ready',
            createdAt: '2026-04-18T00:00:00.000Z',
            updatedAt: '2026-04-18T00:00:00.000Z',
          },
        },
      ]),
    },
  );

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.items.length, 3);
  assert.deepEqual(payload.items.map((item: { asset: { kind: string } }) => item.asset.kind), [
    'vocabulary_project',
    'structure_document',
    'correction_document',
  ]);
});
