import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleStudyGroupOverviewGet } from './[groupId]/route';
import type { StudyGroupOverviewPayload } from '@/lib/shared-projects/types';

function overviewPayload(): StudyGroupOverviewPayload {
  return {
    group: {
      id: 'group-1',
      name: 'Class A',
      inviteCode: 'abcd1234',
      role: 'member',
      visibility: 'public',
      memberCount: 3,
      projectCount: 2,
      createdAt: '2026-06-14T00:00:00.000Z',
      ownerUsername: 'owner',
    },
    projects: [],
    members: [
      { userId: 'u1', username: 'Alice', accountId: 'alice', role: 'owner', isViewer: false },
      { userId: 'u2', username: 'Bob', accountId: 'bob', role: 'member', isViewer: true },
    ],
    leaderboard: [
      { userId: 'u1', username: 'Alice', accountId: 'alice', quizCount: 40, masteredCount: 10, isViewer: false },
      { userId: 'u2', username: 'Bob', accountId: 'bob', quizCount: 12, masteredCount: 3, isViewer: true },
    ],
    missedWords: [
      { englishKey: 'ubiquitous', english: 'ubiquitous', japanese: '遍在する', missCount: 5 },
    ],
    viewerUserId: 'u2',
  };
}

test('group overview GET returns leaderboard and missed words for a member', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1', { method: 'GET' });

  let receivedGroupId = '';
  const res = await handleStudyGroupOverviewGet(
    req,
    { params: Promise.resolve({ groupId: 'group-1' }) },
    {
      requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'u2' } as never }),
      getStudyGroupOverview: async (groupId) => {
        receivedGroupId = groupId;
        return overviewPayload();
      },
    },
  );

  assert.equal(res.status, 200);
  assert.equal(receivedGroupId, 'group-1');
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.leaderboard[0].quizCount, 40);
  assert.equal(payload.members[0].role, 'owner');
  assert.equal(payload.members[0].accountId, 'alice');
  assert.equal(payload.missedWords[0].english, 'ubiquitous');
  assert.equal(payload.viewerUserId, 'u2');
});

test('group overview GET returns 403 when the user is not a member', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1', { method: 'GET' });

  const res = await handleStudyGroupOverviewGet(
    req,
    { params: Promise.resolve({ groupId: 'group-1' }) },
    {
      requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'stranger' } as never }),
      getStudyGroupOverview: async () => null,
    },
  );

  assert.equal(res.status, 403);
  const payload = await res.json();
  assert.equal(payload.success, false);
});
