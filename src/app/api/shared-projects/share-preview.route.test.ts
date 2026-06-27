import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleSharedProjectPreviewGet } from './share/[shareId]/route';
import type { SharedProjectPreviewPayload } from '@/lib/shared-projects/types';

function request(url = 'http://localhost/api/shared-projects/share/share-1?limit=5') {
  return new NextRequest(url, { method: 'GET' });
}

function makePreviewPayload(): SharedProjectPreviewPayload {
  return {
    project: {
      id: 'project-1',
      userId: 'owner-1',
      title: 'shared words',
      sourceLabels: [],
      createdAt: '2026-05-31T00:00:00.000Z',
      shareId: 'share-1',
      shareScope: 'private',
      isFavorite: false,
    },
    words: [
      {
        id: 'word-1',
        projectId: 'project-1',
        english: 'apple',
        japanese: 'りんご',
        distractors: [],
        status: 'new',
        createdAt: '2026-05-31T00:00:00.000Z',
        easeFactor: 2.5,
        intervalDays: 0,
        repetition: 0,
        isFavorite: false,
      },
    ],
    totalWordCount: 12,
    likeCount: 3,
    ownerUsername: 'owner',
    ownerAccountId: 'mkowner',
  };
}

test('shared project preview route returns preview payload without auth', async () => {
  const res = await handleSharedProjectPreviewGet(
    request(),
    { params: Promise.resolve({ shareId: 'share-1' }) },
    {
      extractShareCode: (input) => input,
      getSharedWordbookPreview: async (shareCode, limit) => {
        assert.equal(shareCode, 'share-1');
        assert.equal(limit, 5);
        return makePreviewPayload();
      },
      getSharedProjectPreviewByShareCode: async () => {
        throw new Error('project fallback should not be called');
      },
    },
  );

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.project.id, 'project-1');
  assert.equal(payload.words.length, 1);
  assert.equal(payload.totalWordCount, 12);
});

test('shared project preview route falls back to legacy project share ids', async () => {
  const res = await handleSharedProjectPreviewGet(
    request(),
    { params: Promise.resolve({ shareId: 'share-1' }) },
    {
      extractShareCode: (input) => input,
      getSharedWordbookPreview: async (shareCode, limit) => {
        assert.equal(shareCode, 'share-1');
        assert.equal(limit, 5);
        return null;
      },
      getSharedProjectPreviewByShareCode: async (shareCode, limit) => {
        assert.equal(shareCode, 'share-1');
        assert.equal(limit, 5);
        return makePreviewPayload();
      },
    },
  );

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.project.id, 'project-1');
});

test('shared project preview route returns 404 for an unknown share code', async () => {
  const res = await handleSharedProjectPreviewGet(
    request(),
    { params: Promise.resolve({ shareId: 'missing' }) },
    {
      extractShareCode: (input) => input,
      getSharedWordbookPreview: async () => null,
      getSharedProjectPreviewByShareCode: async () => null,
    },
  );

  assert.equal(res.status, 404);
  const payload = await res.json();
  assert.equal(payload.success, false);
});
