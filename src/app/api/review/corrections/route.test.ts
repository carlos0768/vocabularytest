import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleReviewCorrectionsAnswerPost } from './answer/route';

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/review/corrections/answer', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('review/corrections/answer updates schedule fields', async () => {
  const res = await handleReviewCorrectionsAnswerPost(
    jsonRequest({
      reviewItemId: '11111111-1111-4111-8111-111111111111',
      isCorrect: true,
    }),
    {
      resolveUser: async () => ({ id: 'user-1' }),
      answerReview: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        findingId: 'finding-1',
        userId: 'user-1',
        quizPayload: {
          question: 'He ___ to school.',
          choices: ['go', 'goes'],
          correctAnswer: 'goes',
          explanation: '三人称単数現在です。',
        },
        status: 'review',
        lastReviewedAt: '2026-04-18T00:00:00.000Z',
        nextReviewAt: '2026-04-19T00:00:00.000Z',
        easeFactor: 2.6,
        intervalDays: 1,
        repetition: 1,
        createdAt: '2026-04-18T00:00:00.000Z',
        updatedAt: '2026-04-18T00:00:00.000Z',
      }),
    },
  );

  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.reviewItem.status, 'review');
  assert.equal(payload.reviewItem.intervalDays, 1);
  assert.equal(payload.reviewItem.nextReviewAt, '2026-04-19T00:00:00.000Z');
});
