import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleStudyGroupsGet, handleStudyGroupsPost } from './route';
import { aggregateStudyGroupStrugglingWords } from './shared';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';

function makeGroup(overrides: Partial<StudyGroupSummary> = {}): StudyGroupSummary {
  return {
    id: 'group-1',
    name: 'Class A',
    inviteCode: 'abcd1234',
    role: 'owner',
    visibility: 'private',
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
    visibility: 'public',
  });

  let receivedName = '';
  let receivedVisibility = '';
  const res = await handleStudyGroupsPost(req, {
    requireAuthenticatedUser: async () => ({
      ok: true as const,
      user: { id: 'user-1' } as never,
    }),
    createStudyGroup: async (_userId, name, visibility) => {
      receivedName = name;
      receivedVisibility = visibility ?? '';
      return makeGroup({ name, visibility });
    },
  });

  assert.equal(res.status, 201);
  assert.equal(receivedName, 'English Club');
  assert.equal(receivedVisibility, 'public');
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.group.name, 'English Club');
});

test('aggregateStudyGroupStrugglingWords sorts from most missed to least missed', () => {
  const rows = [
    {
      user_id: 'user-1',
      word_id: 'word-a1',
      project_id: 'project-a',
      english_key: 'run',
      english: 'run',
      japanese: '走る',
      created_at: '2026-06-20T00:00:00.000Z',
    },
    {
      user_id: 'user-1',
      word_id: 'word-a1',
      project_id: 'project-a',
      english_key: 'run',
      english: 'run',
      japanese: '走る',
      created_at: '2026-06-20T00:10:00.000Z',
    },
    {
      user_id: 'user-2',
      word_id: 'word-a2',
      project_id: 'project-b',
      english_key: 'run',
      english: 'Run',
      japanese: '走る',
      created_at: '2026-06-21T00:00:00.000Z',
    },
    {
      user_id: 'user-3',
      word_id: 'word-b',
      project_id: 'project-b',
      english_key: 'book',
      english: 'book',
      japanese: '本',
      created_at: '2026-06-19T00:00:00.000Z',
    },
  ];

  const words = aggregateStudyGroupStrugglingWords(rows);

  assert.deepEqual(
    words.map((word) => ({
      english: word.english,
      wrongCount: word.wrongCount,
      learnerCount: word.learnerCount,
    })),
    [
      { english: 'run', wrongCount: 3, learnerCount: 2 },
      { english: 'book', wrongCount: 1, learnerCount: 1 },
    ],
  );
});
