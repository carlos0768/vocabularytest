import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import {
  handleStudyGroupProjectDelete,
  handleStudyGroupProjectPost,
} from './[groupId]/projects/[projectId]/route';
import { StudyGroupProjectAccessError } from './shared';

const context = {
  params: Promise.resolve({ groupId: 'group-1', projectId: 'project-1' }),
};

test('study group project POST requires Pro when sharing a wordbook', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1/projects/project-1', {
    method: 'POST',
  });

  const res = await handleStudyGroupProjectPost(req, context, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    addProjectToStudyGroup: async () => {
      throw new StudyGroupProjectAccessError('pro_required');
    },
  });

  assert.equal(res.status, 403);
  const payload = await res.json();
  assert.equal(payload.code, 'PRO_REQUIRED');
});

test('study group project DELETE rejects non-authorized members', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1/projects/project-1', {
    method: 'DELETE',
  });

  const res = await handleStudyGroupProjectDelete(req, context, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-2' } as never,
    }),
    removeProjectFromStudyGroup: async () => {
      throw new StudyGroupProjectAccessError('remove_forbidden');
    },
  });

  assert.equal(res.status, 403);
  const payload = await res.json();
  assert.equal(payload.success, false);
});

test('study group project DELETE removes a shared wordbook', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1/projects/project-1', {
    method: 'DELETE',
  });

  const calls: Array<{ groupId: string; projectId: string; userId: string }> = [];
  const res = await handleStudyGroupProjectDelete(req, context, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    removeProjectFromStudyGroup: async (groupId, projectId, userId) => {
      calls.push({ groupId, projectId, userId });
      return true;
    },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(calls, [{ groupId: 'group-1', projectId: 'project-1', userId: 'user-1' }]);
  const payload = await res.json();
  assert.equal(payload.success, true);
});
