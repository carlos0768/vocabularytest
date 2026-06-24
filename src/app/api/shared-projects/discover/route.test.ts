import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSharedProjectsDiscoverGet } from './route';

test('shared-projects/discover GET searches across all categories by default', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/discover?q=toeic', {
    method: 'GET',
  });

  const calls: string[] = [];
  const res = await handleSharedProjectsDiscoverGet(req, {
    listPublicSharedUsers: async (options) => {
      assert.ok(options);
      calls.push(`users:${options.query}:${options.limit}`);
      return { users: [], nextCursor: null };
    },
    listPublicSharedProjects: async (options) => {
      assert.ok(options);
      calls.push(`projects:${options.query}:${options.limit}`);
      return { items: [], nextCursor: null };
    },
    listPublicStudyGroups: async (options) => {
      assert.ok(options);
      calls.push(`groups:${options.query}:${options.limit}`);
      return { groups: [], nextCursor: null };
    },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(calls.sort(), ['groups:toeic:6', 'projects:toeic:6', 'users:toeic:6']);
  const payload = await res.json();
  assert.equal(payload.category, 'all');
});

test('shared-projects/discover GET narrows to one category with cursor', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/discover?category=groups&limit=12&cursor=c1&q=class', {
    method: 'GET',
  });

  let received = '';
  const res = await handleSharedProjectsDiscoverGet(req, {
    listPublicStudyGroups: async (options) => {
      assert.ok(options);
      received = `${options.limit}:${options.cursor}:${options.query}`;
      return { groups: [], nextCursor: 'c2' };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(received, '12:c1:class');
  const payload = await res.json();
  assert.equal(payload.category, 'groups');
  assert.equal(payload.nextCursor, 'c2');
});
