import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleStructureDocumentsPost } from './route';
import { handleStructureDocumentGet } from './[id]/route';

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('structure-documents POST and GET return persisted parse tree', async () => {
  const created = {
    asset: {
      id: 'asset-1',
      userId: 'user-1',
      kind: 'structure_document' as const,
      title: '構文テスト',
      status: 'ready' as const,
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    },
    document: {
      assetId: 'asset-1',
      originalText: 'When he will arrive is unknown.',
      normalizedText: 'When he will arrive is unknown.',
      sourceType: 'paste' as const,
      cefrTarget: 'pre1' as const,
      parseTree: [
        {
          id: 'node-1',
          label: '名詞節',
          text: 'When he will arrive',
          start: 0,
          end: 20,
          children: [],
          collapsible: true,
        },
      ],
      analysisSummary: {
        overview: '文頭の when 節全体が主語です。',
        detectedPatterns: ['名詞節'],
        cefrTarget: 'pre1' as const,
        notes: [
          {
            label: '名詞節',
            shortLabel: 'S',
            body: '文頭の when 節全体が主語として働きます。',
          },
        ],
      },
      mentionedTerms: ['committee', 'meticulous'],
      lastAnalyzedAt: '2026-04-18T00:00:00.000Z',
    },
  };

  const postRes = await handleStructureDocumentsPost(
    jsonRequest('http://localhost/api/structure-documents', {
      title: '構文テスト',
      text: 'When he will arrive is unknown.',
      sourceType: 'paste',
    }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      createDocument: async () => created,
    },
  );

  assert.equal(postRes.status, 200);
  const postPayload = await postRes.json();
  assert.equal(postPayload.success, true);
  assert.equal(postPayload.document.parseTree[0].label, '名詞節');
  assert.equal(postPayload.document.analysisSummary.notes[0].label, '名詞節');
  assert.deepEqual(postPayload.document.mentionedTerms, ['committee', 'meticulous']);

  const getRes = await handleStructureDocumentGet(
    new NextRequest('http://localhost/api/structure-documents/asset-1', { method: 'GET' }),
    { id: 'asset-1' },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getDocument: async () => created,
    },
  );

  assert.equal(getRes.status, 200);
  const getPayload = await getRes.json();
  assert.deepEqual(getPayload.document.parseTree, created.document.parseTree);
});
