import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleCorrectionDocumentsPost } from './route';
import { handleCorrectionDocumentGet } from './[id]/route';

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('correction-documents POST returns inline annotations, findings, and review items', async () => {
  const created = {
    asset: {
      id: 'asset-1',
      userId: 'user-1',
      kind: 'correction_document' as const,
      title: '添削テスト',
      status: 'ready' as const,
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    },
    document: {
      assetId: 'asset-1',
      originalText: 'He go to school.',
      correctedText: 'He goes to school.',
      sourceType: 'paste' as const,
      inlineAnnotations: [
        {
          id: 'ann-1',
          start: 3,
          end: 5,
          label: '主語と動詞の一致',
          message: 'goes が必要です。',
          severity: 'error' as const,
          suggestedText: 'goes',
        },
      ],
      summary: {
        overview: '動詞の活用を修正しました。',
        counts: {
          grammar: 1,
          idiom: 0,
          usage: 0,
        },
      },
      lastAnalyzedAt: '2026-04-18T00:00:00.000Z',
    },
    findings: [
      {
        id: 'finding-1',
        assetId: 'asset-1',
        spanStart: 3,
        spanEnd: 5,
        category: 'grammar' as const,
        ruleNameJa: '主語と動詞の一致',
        ruleNameEn: 'Subject-Verb Agreement',
        incorrectText: 'go',
        suggestedText: 'goes',
        formalUsageJa: '三人称単数現在では動詞に -s を付けます。',
        learnerAdvice: '主語が he / she / it かを先に確認してください。',
        difficulty: 2 as const,
        sortOrder: 0,
      },
    ],
    reviewItems: [
      {
        id: 'review-1',
        findingId: 'finding-1',
        userId: 'user-1',
        quizPayload: {
          question: 'He ___ to school.',
          choices: ['go', 'goes'],
          correctAnswer: 'goes',
          explanation: '三人称単数現在です。',
          ruleNameJa: '主語と動詞の一致',
        },
        status: 'new' as const,
        easeFactor: 2.5,
        intervalDays: 0,
        repetition: 0,
        createdAt: '2026-04-18T00:00:00.000Z',
        updatedAt: '2026-04-18T00:00:00.000Z',
      },
    ],
  };

  const postRes = await handleCorrectionDocumentsPost(
    jsonRequest('http://localhost/api/correction-documents', {
      title: '添削テスト',
      text: 'He go to school.',
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
  assert.equal(postPayload.findings.length, 1);
  assert.equal(postPayload.reviewItems.length, 1);
  assert.equal(postPayload.findings[0].difficulty, 2);

  const getRes = await handleCorrectionDocumentGet(
    new NextRequest('http://localhost/api/correction-documents/asset-1', { method: 'GET' }),
    { id: 'asset-1' },
    {
      resolveUser: async () => ({ id: 'user-1' }),
      getDocument: async () => created,
    },
  );

  assert.equal(getRes.status, 200);
  const getPayload = await getRes.json();
  assert.equal(getPayload.document.correctedText, 'He goes to school.');
});
