import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from './middleware';

/**
 * マッチャーは「api routes (handled separately)」と書いてありながら
 * /api を除外しておらず、APIへのリクエストは本文ごとミドルウェアを通っていた。
 * 守るもの (protectedPaths) は画面のパスだけなので、通す意味が無い。
 */
const matches = (pathname: string) => new RegExp(`^${config.matcher[0]}$`).test(pathname);

test('API routes do not go through the middleware', () => {
  assert.equal(matches('/api/voice-quiz/recognize'), false);
  assert.equal(matches('/api/extract'), false);
  assert.equal(matches('/api/subscription/webhook'), false);
});

test('the pages the middleware guards still match', () => {
  assert.equal(matches('/voice-quiz/abc123'), true);
  assert.equal(matches('/quiz/abc123'), true);
  assert.equal(matches('/login'), true);
  assert.equal(matches('/'), true);
});

test('static assets stay excluded', () => {
  assert.equal(matches('/_next/static/chunk.js'), false);
  assert.equal(matches('/favicon.ico'), false);
  assert.equal(matches('/icon.png'), false);
});
