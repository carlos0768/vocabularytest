import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleAssetsOcrTextPost } from './route';

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/assets/ocr-text', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('assets/ocr-text returns 401 when unauthenticated', async () => {
  const res = await handleAssetsOcrTextPost(jsonRequest({ image: 'data:image/png;base64,AAA' }), {
    resolveUser: async () => null,
  });

  assert.equal(res.status, 401);
  const payload = await res.json();
  assert.equal(payload.success, false);
});

test('assets/ocr-text returns 400 for invalid payload', async () => {
  const res = await handleAssetsOcrTextPost(jsonRequest({}), {
    resolveUser: async () => ({ id: 'user-1' }),
  });

  assert.equal(res.status, 400);
});
