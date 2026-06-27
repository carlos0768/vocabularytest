import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleStudyGroupPreviewGet } from './[groupId]/preview/route';
import type { PublicStudyGroupSummary } from '@/lib/shared-projects/types';

function previewSummary(): PublicStudyGroupSummary {
  return {
    id: 'group-1',
    name: 'Class A',
    visibility: 'public',
    memberCount: 3,
    projectCount: 2,
    createdAt: '2026-06-14T00:00:00.000Z',
    ownerUsername: 'owner',
  };
}

test('group preview GET returns the public summary for non-members', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1/preview', { method: 'GET' });

  let receivedGroupId = '';
  const res = await handleStudyGroupPreviewGet(
    req,
    { params: Promise.resolve({ groupId: 'group-1' }) },
    {
      getPublicStudyGroupPreview: async (groupId) => {
        receivedGroupId = groupId;
        return previewSummary();
      },
    },
  );

  assert.equal(res.status, 200);
  assert.equal(receivedGroupId, 'group-1');
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.group.name, 'Class A');
  assert.equal(payload.group.visibility, 'public');
});

test('group preview GET returns 404 for an unknown group', async () => {
  const req = new NextRequest('http://localhost/api/shared-projects/groups/group-1/preview', { method: 'GET' });

  const res = await handleStudyGroupPreviewGet(
    req,
    { params: Promise.resolve({ groupId: 'group-1' }) },
    {
      getPublicStudyGroupPreview: async () => null,
    },
  );

  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.success, false);
});
