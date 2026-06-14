import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleStudyGroupJoinPost } from './route';

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/shared-projects/groups/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('study group join returns 404 for unknown invite code', async () => {
  const res = await handleStudyGroupJoinPost(jsonRequest({ inviteCode: 'missing' }), {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    joinStudyGroupByInviteCode: async () => null,
  });

  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.success, false);
});

test('study group join returns the joined group', async () => {
  const res = await handleStudyGroupJoinPost(jsonRequest({ inviteCode: 'abcd-1234' }), {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    joinStudyGroupByInviteCode: async (_userId, inviteCode) => ({
      id: 'group-1',
      name: 'Class A',
      inviteCode,
      role: 'member',
      memberCount: 3,
      projectCount: 2,
      createdAt: '2026-06-14T00:00:00.000Z',
    }),
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.group.role, 'member');
});
