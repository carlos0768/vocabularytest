import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleOAuthAuthorizePost } from '@/app/api/oauth/authorize/route';
import { hashAuthorizationCode } from '@/lib/oauth/chatgpt-actions';

const REDIRECT_URI = 'https://chat.openai.com/aip/g-abc123/oauth/callback';

const TEST_CONFIG = {
  clientId: 'merken-chatgpt',
  clientSecret: 'secret',
  allowedRedirectUris: [REDIRECT_URI],
};

type InsertedRow = {
  codeHash: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  scope: string | null;
};

function jsonRequest(body: unknown) {
  return new NextRequest('http://localhost/api/oauth/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildDeps(overrides?: {
  user?: { id: string } | null;
  config?: typeof TEST_CONFIG;
  inserted?: InsertedRow[];
}) {
  const inserted = overrides?.inserted ?? [];
  return {
    resolveUser: async () => (overrides?.user === undefined ? { id: 'user-1' } : overrides.user),
    getConfig: () => overrides?.config ?? TEST_CONFIG,
    insertAuthorizationCode: async (row: InsertedRow) => {
      inserted.push(row);
    },
  };
}

test('authorize returns 401 without an authenticated session', async () => {
  const response = await handleOAuthAuthorizePost(
    jsonRequest({ clientId: 'merken-chatgpt', redirectUri: REDIRECT_URI }),
    buildDeps({ user: null }),
  );
  assert.equal(response.status, 401);
});

test('authorize returns 400 for a malformed body', async () => {
  const response = await handleOAuthAuthorizePost(
    jsonRequest({ clientId: 'merken-chatgpt' }),
    buildDeps(),
  );
  assert.equal(response.status, 400);
});

test('authorize returns 503 when the integration is not configured', async () => {
  const response = await handleOAuthAuthorizePost(
    jsonRequest({ clientId: 'merken-chatgpt', redirectUri: REDIRECT_URI }),
    buildDeps({ config: { clientId: '', clientSecret: '', allowedRedirectUris: [] } }),
  );
  assert.equal(response.status, 503);
});

test('authorize rejects an unknown client id', async () => {
  const response = await handleOAuthAuthorizePost(
    jsonRequest({ clientId: 'unknown-client', redirectUri: REDIRECT_URI }),
    buildDeps(),
  );
  assert.equal(response.status, 400);
});

test('authorize rejects a redirect uri outside the allowlist without redirecting', async () => {
  const inserted: InsertedRow[] = [];
  const response = await handleOAuthAuthorizePost(
    jsonRequest({
      clientId: 'merken-chatgpt',
      redirectUri: 'https://evil.example/oauth/callback',
    }),
    buildDeps({ inserted }),
  );
  assert.equal(response.status, 400);
  assert.equal(inserted.length, 0);
});

test('authorize deny returns access_denied redirect without issuing a code', async () => {
  const inserted: InsertedRow[] = [];
  const response = await handleOAuthAuthorizePost(
    jsonRequest({
      clientId: 'merken-chatgpt',
      redirectUri: REDIRECT_URI,
      state: 'xyz',
      decision: 'deny',
    }),
    buildDeps({ inserted }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  const redirectUrl = new URL(payload.redirectUrl);
  assert.equal(redirectUrl.searchParams.get('error'), 'access_denied');
  assert.equal(redirectUrl.searchParams.get('state'), 'xyz');
  assert.equal(redirectUrl.searchParams.get('code'), null);
  assert.equal(inserted.length, 0);
});

test('authorize approve stores the hashed code and redirects with code + state', async () => {
  const inserted: InsertedRow[] = [];
  const response = await handleOAuthAuthorizePost(
    jsonRequest({
      clientId: 'merken-chatgpt',
      redirectUri: REDIRECT_URI,
      state: 'xyz',
      scope: 'words',
    }),
    buildDeps({ inserted }),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  const redirectUrl = new URL(payload.redirectUrl);
  const code = redirectUrl.searchParams.get('code');
  assert.ok(code && code.length >= 40);
  assert.equal(redirectUrl.searchParams.get('state'), 'xyz');
  assert.equal(`${redirectUrl.origin}${redirectUrl.pathname}`, REDIRECT_URI);

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].userId, 'user-1');
  assert.equal(inserted[0].clientId, 'merken-chatgpt');
  assert.equal(inserted[0].redirectUri, REDIRECT_URI);
  assert.equal(inserted[0].scope, 'words');
  // 平文コードは保存されず、ハッシュのみが渡る
  assert.equal(inserted[0].codeHash, hashAuthorizationCode(code as string));
  assert.notEqual(inserted[0].codeHash, code);
});
