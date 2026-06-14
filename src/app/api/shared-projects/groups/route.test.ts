import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleStudyGroupsGet, handleStudyGroupsPost } from './route';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';

function makeGroup(overrides: Partial<StudyGroupSummary> = {}): StudyGroupSummary {
  return {
    id: 'group-1',
    name: 'Class A',
    inviteCode: 'abcd1234',
    role: 'owner',
    memberCount: 1,
    projectCount: 0,
    createdAt: '2026-06-14T00:00:00.000Z',
    ownerUsername: 'me',
    ...overrides,
  };
}

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('study groups GET forwards projectId for share sheet state', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups?projectId=project-1', {
    method: 'GET',
  });

  let receivedProjectId: string | null | undefined;
  const res = await handleStudyGroupsGet(req, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    listStudyGroupsForUser: async (_userId, options) => {
      receivedProjectId = options?.projectId;
      return { groups: [makeGroup({ projectShared: true })] };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(receivedProjectId, 'project-1');
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.groups[0].projectShared, true);
});

test('study groups POST creates a group for the authenticated user', async () => {
  const req = jsonRequest('http://localhost/api/shared-projects/groups', {
    name: 'English Club',
  });

  let receivedName = '';
  const res = await handleStudyGroupsPost(req, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    createStudyGroup: async (_userId, name) => {
      receivedName = name;
      return makeGroup({ name });
    },
  });

  assert.equal(res.status, 201);
  assert.equal(receivedName, 'English Club');
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.group.name, 'English Club');
});
