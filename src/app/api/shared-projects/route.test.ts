import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSharedProjectsGet, handleSharedProjectsPost } from './route';
import { SharedProjectsSchemaUnavailableError } from './shared';

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('shared-projects GET returns 200 with degraded payload', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects', { method: 'GET' });

  const res = await handleSharedProjectsGet(req, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    listSharedProjects: async () => ({
      owned: [
        {
          project: {
            id: 'project-1',
            userId: 'user-1',
            title: 'owned',
            createdAt: '2026-03-29T00:00:00.000Z',
            shareScope: 'private',
            sourceLabels: [],
            isFavorite: false,
          },
          accessRole: 'owner',
          wordCount: 3,
          collaboratorCount: 1,
        },
      ],
      joined: [],
      public: [],
    }),
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.owned.length, 1);
  assert.deepEqual(payload.joined, []);
  assert.deepEqual(payload.public, []);
});

test('shared-projects POST returns 503 when project_members schema is unavailable', async () => {
  const req = jsonRequest('http://localhost/api/shared-projects', {
    codeOrLink: 'abcd1234',
  });

  const res = await handleSharedProjectsPost(req, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    extractShareCode: () => 'abcd1234',
    getProjectByShareCode: async () => ({
      id: 'project-1',
      user_id: 'owner-1',
      title: 'shared',
      created_at: '2026-03-29T00:00:00.000Z',
    } as never),
    upsertProjectMember: async () => {
      throw new SharedProjectsSchemaUnavailableError('project_members');
    },
    listSharedProjects: async () => ({
      owned: [],
      joined: [],
      public: [],
    }),
  });

  assert.equal(res.status, 503);
  const payload = await res.json();
  assert.equal(payload.success, false);
  assert.equal(payload.error, '共有機能の更新が未完了です。しばらくしてから再度お試しください。');
});
