import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleShareImportPreviewPost } from '@/app/api/share-import/preview/route';
import { handleShareImportCommitPost } from '@/app/api/share-import/commit/route';
import { handleShareImportProjectsGet } from '@/app/api/share-import/projects/route';

function jsonRequest(url: string, body: unknown, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test('share-import preview returns 401 when unauthenticated', async () => {
  const req = jsonRequest('http://localhost/api/share-import/preview', {
    text: 'person',
  });

  const res = await handleShareImportPreviewPost(req, {
    resolveUser: async () => null,
    checkUsage: async () => ({
      allowed: true,
      requires_pro: false,
      current_count: 0,
      limit: 100,
      is_pro: false,
    }),
    translateToJapanese: async () => '人',
    translateToEnglish: async () => 'person',
  });

  assert.equal(res.status, 401);
});

test('share-import preview sentence is reduced to one representative word', async () => {
  const req = jsonRequest('http://localhost/api/share-import/preview', {
    text: 'I met a person yesterday.',
    sourceApp: 'com.google.Translate',
  });

  const res = await handleShareImportPreviewPost(req, {
    resolveUser: async () => ({ id: 'user-1' }),
    checkUsage: async () => ({
      allowed: true,
      requires_pro: false,
      current_count: 2,
      limit: 100,
      is_pro: false,
    }),
    translateToJapanese: async (english) => {
      assert.equal(english, 'person');
      return '人';
    },
    translateToEnglish: async () => {
      throw new Error('should_not_be_called');
    },
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.candidate.english, 'person');
  assert.equal(payload.candidate.japanese, '人');
  assert.equal(payload.candidate.wasSentence, true);
  assert.equal(Array.isArray(payload.candidate.warnings), true);
  assert.equal(payload.candidate.warnings.length > 0, true);
});

test('share-import preview can recover when only Japanese text is shared', async () => {
  const req = jsonRequest('http://localhost/api/share-import/preview', {
    text: '対面での会議',
    sourceApp: 'com.google.Translate',
  });

  const res = await handleShareImportPreviewPost(req, {
    resolveUser: async () => ({ id: 'user-1' }),
    checkUsage: async () => ({
      allowed: true,
      requires_pro: false,
      current_count: 3,
      limit: 100,
      is_pro: false,
    }),
    translateToJapanese: async () => {
      throw new Error('should_not_be_called');
    },
    translateToEnglish: async (japanese) => {
      assert.equal(japanese, '対面での会議');
      return 'face-to-face meeting';
    },
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.success, true);
  assert.equal(payload.candidate.english, 'face-to-face meeting');
  assert.equal(payload.candidate.japanese, '対面での会議');
  assert.equal(Array.isArray(payload.candidate.warnings), true);
  assert.equal(payload.candidate.warnings.includes('日本語入力のため英語へ変換しました'), true);
});

test('share-import projects returns 401 when unauthenticated', async () => {
  const req = new NextRequest('http://localhost/api/share-import/projects?limit=20', { method: 'GET' });

  const res = await handleShareImportProjectsGet(req, {
    resolveUser: async () => null,
    fetchProjects: async () => [],
  });

  assert.equal(res.status, 401);
});

test('share-import commit returns 401 when unauthenticated', async () => {
  const req = jsonRequest('http://localhost/api/share-import/commit', {
    targetProjectId: null,
    english: 'person',
    japanese: '人',
  });

  const res = await handleShareImportCommitPost(req, {
    resolveUser: async () => null,
    findOwnedProject: async () => null,
    createProject: async () => ({ id: 'p1', title: 't', user_id: 'u' }),
    listWords: async () => [],
    insertWord: async () => ({ id: 'w1' }),
  });

  assert.equal(res.status, 401);
});

test('share-import commit rejects target project that is not owned', async () => {
  const req = jsonRequest('http://localhost/api/share-import/commit', {
    targetProjectId: '11111111-1111-4111-8111-111111111111',
    english: 'person',
    japanese: '人',
  });

  const res = await handleShareImportCommitPost(req, {
    resolveUser: async () => ({ id: 'user-1' }),
    findOwnedProject: async () => null,
    createProject: async () => ({ id: 'p1', title: 't', user_id: 'u' }),
    listWords: async () => [],
    insertWord: async () => ({ id: 'w1' }),
  });

  assert.equal(res.status, 403);
});

test('share-import commit returns duplicate=true when normalized english+japanese already exists', async () => {
  const req = jsonRequest('http://localhost/api/share-import/commit', {
    targetProjectId: '11111111-1111-4111-8111-111111111111',
    english: ' Person ',
    japanese: ' 人 ',
  });

  let inserted = false;

  const res = await handleShareImportCommitPost(req, {
    resolveUser: async () => ({ id: 'user-1' }),
    findOwnedProject: async () => ({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'TOEFL',
      user_id: 'user-1',
    }),
    createProject: async () => ({ id: 'p1', title: 't', user_id: 'u' }),
    listWords: async () => [
      { id: 'w-existing', english: 'person', japanese: '人' },
    ],
    insertWord: async () => {
      inserted = true;
      return { id: 'w-new' };
    },
  });

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.duplicate, true);
  assert.equal(payload.created, false);
  assert.equal(payload.wordId, 'w-existing');
  assert.equal(inserted, false);
});
