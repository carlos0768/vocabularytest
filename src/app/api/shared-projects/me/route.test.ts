import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSharedProjectsMeGet } from './route';

test('shared-projects/me GET returns owned and joined only', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/me', { method: 'GET' });

  const res = await handleSharedProjectsMeGet(req, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    listAccessibleSharedProjects: async () => ({
      owned: [
        {
          project: {
            id: 'owned-1',
            userId: 'user-1',
            title: 'owned',
            createdAt: '2026-03-29T00:00:00.000Z',
            shareId: 'owned-share',
            shareScope: 'public',
            sourceLabels: [],
            isFavorite: false,
          },
          accessRole: 'owner',
        },
      ],
      joined: [],
    }),
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.deepEqual(Object.keys(payload).sort(), ['joined', 'owned']);
  assert.equal(payload.owned.length, 1);
  assert.deepEqual(payload.joined, []);
});
