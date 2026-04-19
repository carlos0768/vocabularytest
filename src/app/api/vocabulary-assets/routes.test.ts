import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleVocabularyAssetsPost } from './route';
import { handleVocabularyAssetGet } from './[id]/route';

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('vocabulary-assets POST creates a project-backed asset and GET returns project words', async () => {
  const created = {
    asset: {
      id: 'asset-vocab-1',
      userId: 'user-1',
      kind: 'vocabulary_project' as const,
      title: '英検準1級 Unit 3',
      status: 'ready' as const,
      legacyProjectId: 'project-1',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    },
    project: {
      id: 'project-1',
      userId: 'user-1',
      title: '英検準1級 Unit 3',
      sourceLabels: [],
      createdAt: '2026-04-18T00:00:00.000Z',
    },
    words: [
      {
        id: 'word-1',
        projectId: 'project-1',
        english: 'persevere',
        japanese: '耐え抜く',
        distractors: [],
        status: 'new' as const,
        createdAt: '2026-04-18T00:00:00.000Z',
        easeFactor: 2.5,
        intervalDays: 0,
        repetition: 0,
        isFavorite: false,
      },
    ],
    stats: {
      totalWords: 1,
      newWords: 1,
      reviewWords: 0,
      masteredWords: 0,
      activeWords: 0,
      passiveWords: 0,
      exampleCount: 0,
    },
    idioms: ['in spite of'],
  };

  const postRes = await handleVocabularyAssetsPost(
    jsonRequest('http://localhost/api/vocabulary-assets', {
      title: '英検準1級 Unit 3',
      collectionId: '67d5db85-cdbc-4a1c-a321-4b4f0a0a9ec0',
    }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      createAsset: async () => created,
    },
  );

  assert.equal(postRes.status, 200);
  const postPayload = await postRes.json();
  assert.equal(postPayload.success, true);
  assert.equal(postPayload.asset.kind, 'vocabulary_project');
  assert.equal(postPayload.project.id, 'project-1');

  const getRes = await handleVocabularyAssetGet(
    new NextRequest('http://localhost/api/vocabulary-assets/asset-vocab-1', { method: 'GET' }),
    { id: 'asset-vocab-1' },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAsset: async () => created,
    },
  );

  assert.equal(getRes.status, 200);
  const getPayload = await getRes.json();
  assert.equal(getPayload.words.length, 1);
  assert.equal(getPayload.project.title, '英検準1級 Unit 3');
});

test('vocabulary-assets GET accepts legacy project id identifiers', async () => {
  const created = {
    asset: {
      id: 'asset-vocab-1',
      userId: 'user-1',
      kind: 'vocabulary_project' as const,
      title: '英検準1級 Unit 3',
      status: 'ready' as const,
      legacyProjectId: 'project-1',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    },
    project: {
      id: 'project-1',
      userId: 'user-1',
      title: '英検準1級 Unit 3',
      sourceLabels: [],
      createdAt: '2026-04-18T00:00:00.000Z',
    },
    words: [],
    stats: {
      totalWords: 0,
      newWords: 0,
      reviewWords: 0,
      masteredWords: 0,
      activeWords: 0,
      passiveWords: 0,
      exampleCount: 0,
    },
    idioms: [],
  };

  const getRes = await handleVocabularyAssetGet(
    new NextRequest('http://localhost/api/vocabulary-assets/project-1', { method: 'GET' }),
    { id: 'project-1' },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAsset: async (_userId, identifier) => {
        assert.equal(identifier, 'project-1');
        return created;
      },
    },
  );

  assert.equal(getRes.status, 200);
  const getPayload = await getRes.json();
  assert.equal(getPayload.asset.legacyProjectId, 'project-1');
});

test('vocabulary-assets GET returns a specific message when legacy asset backfill fails', async () => {
  const getRes = await handleVocabularyAssetGet(
    new NextRequest('http://localhost/api/vocabulary-assets/project-1', { method: 'GET' }),
    { id: 'project-1' },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getAsset: async () => {
        throw new Error('legacy_learning_assets_backfill_failed:boom');
      },
    },
  );

  assert.equal(getRes.status, 500);
  const getPayload = await getRes.json();
  assert.equal(getPayload.error, '旧単語帳アセットの補完に失敗しました。');
});
