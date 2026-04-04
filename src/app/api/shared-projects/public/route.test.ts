import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSharedProjectsPublicGet } from './route';

test('shared-projects/public GET forwards limit and cursor', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/public?limit=8&cursor=cursor-1', {
    method: 'GET',
  });

  let receivedLimit: number | undefined;
  let receivedCursor: string | null | undefined;

  const res = await handleSharedProjectsPublicGet(req, {
    listPublicSharedProjects: async ({ limit, cursor }) => {
      receivedLimit = limit;
      receivedCursor = cursor;
      return {
        items: [],
        nextCursor: null,
      };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(receivedLimit, 8);
  assert.equal(receivedCursor, 'cursor-1');
  assert.equal(res.headers.get('cache-control'), 'public, s-maxage=60, stale-while-revalidate=300');
});
