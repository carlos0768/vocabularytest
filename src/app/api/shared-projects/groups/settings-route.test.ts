import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleStudyGroupDelete, handleStudyGroupUpdatePatch } from './[groupId]/route';
import { handleStudyGroupMemberDelete } from './[groupId]/members/[userId]/route';
import { StudyGroupAccessError } from './shared';

const groupContext = { params: Promise.resolve({ groupId: 'group-1' }) };

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/shared-projects/groups/group-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('group PATCH renames the group for the owner', async () => {
  let receivedName: string | undefined;
  const res = await handleStudyGroupUpdatePatch(patchRequest({ name: '新しい名前' }), groupContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'owner-1' } as never }),
    updateStudyGroup: async (_groupId, _userId, updates) => {
      receivedName = updates.name;
      return {
        id: 'group-1',
        name: updates.name ?? '',
        inviteCode: 'abcd1234',
        role: 'owner',
        visibility: 'private',
        memberCount: 2,
        projectCount: 1,
        createdAt: '2026-06-14T00:00:00.000Z',
      };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(receivedName, '新しい名前');
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.group.name, '新しい名前');
});

test('group PATCH updates visibility for the owner', async () => {
  let receivedVisibility: string | undefined;
  const res = await handleStudyGroupUpdatePatch(patchRequest({ visibility: 'public' }), groupContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'owner-1' } as never }),
    updateStudyGroup: async (_groupId, _userId, updates) => {
      receivedVisibility = updates.visibility;
      return {
        id: 'group-1',
        name: 'グループ',
        inviteCode: 'abcd1234',
        role: 'owner',
        visibility: updates.visibility ?? 'private',
        memberCount: 2,
        projectCount: 1,
        createdAt: '2026-06-14T00:00:00.000Z',
      };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(receivedVisibility, 'public');
  const payload = await res.json();
  assert.equal(payload.group.visibility, 'public');
});

test('group PATCH rejects an empty name before reaching the handler', async () => {
  let called = false;
  const res = await handleStudyGroupUpdatePatch(patchRequest({ name: '   ' }), groupContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'owner-1' } as never }),
    updateStudyGroup: async () => {
      called = true;
      return null;
    },
  });

  assert.equal(res.status, 400);
  assert.equal(called, false);
});

test('group PATCH returns 403 when a non-owner attempts a rename', async () => {
  const res = await handleStudyGroupUpdatePatch(patchRequest({ name: 'Hi' }), groupContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'member-1' } as never }),
    updateStudyGroup: async () => {
      throw new StudyGroupAccessError('owner_required');
    },
  });

  assert.equal(res.status, 403);
  const payload = await res.json();
  assert.equal(payload.success, false);
});

test('member DELETE removes a member for the owner', async () => {
  const memberContext = { params: Promise.resolve({ groupId: 'group-1', userId: 'member-9' }) };
  let removedTarget = '';
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1/members/member-9', {
    method: 'DELETE',
  });

  const res = await handleStudyGroupMemberDelete(req, memberContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'owner-1' } as never }),
    removeStudyGroupMember: async (_groupId, _userId, targetUserId) => {
      removedTarget = targetUserId;
      return true;
    },
  });

  assert.equal(res.status, 200);
  assert.equal(removedTarget, 'member-9');
  const payload = await res.json();
  assert.equal(payload.success, true);
});

test('group DELETE removes the group for the owner', async () => {
  let removedGroup = '';
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1', {
    method: 'DELETE',
  });

  const res = await handleStudyGroupDelete(req, groupContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'owner-1' } as never }),
    deleteStudyGroup: async (groupId) => {
      removedGroup = groupId;
      return true;
    },
  });

  assert.equal(res.status, 200);
  assert.equal(removedGroup, 'group-1');
  const payload = await res.json();
  assert.equal(payload.success, true);
});

test('group DELETE returns 403 when a non-owner attempts deletion', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1', {
    method: 'DELETE',
  });

  const res = await handleStudyGroupDelete(req, groupContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'member-1' } as never }),
    deleteStudyGroup: async () => {
      throw new StudyGroupAccessError('owner_required');
    },
  });

  assert.equal(res.status, 403);
  const payload = await res.json();
  assert.equal(payload.success, false);
});

test('member DELETE refuses to remove the owner', async () => {
  const memberContext = { params: Promise.resolve({ groupId: 'group-1', userId: 'owner-1' }) };
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1/members/owner-1', {
    method: 'DELETE',
  });

  const res = await handleStudyGroupMemberDelete(req, memberContext, {
    requireAuthenticatedUser: async () => ({ ok: true as const, user: { id: 'owner-1' } as never }),
    removeStudyGroupMember: async () => {
      throw new StudyGroupAccessError('cannot_remove_owner');
    },
  });

  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.success, false);
});
