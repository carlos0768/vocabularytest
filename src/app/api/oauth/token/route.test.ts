import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleOAuthTokenPost } from '@/app/api/oauth/token/route';
import { hashAuthorizationCode } from '@/lib/oauth/chatgpt-actions';

const REDIRECT_URI = 'https://chat.openai.com/aip/g-abc123/oauth/callback';

const TEST_CONFIG = {
  clientId: 'merken-chatgpt',
  clientSecret: 'test-secret-value',
  allowedRedirectUris: [REDIRECT_URI],
};

const VALID_CODE = 'valid-authorization-code';

const SESSION_TOKENS = {
  accessToken: 'sb-access-token',
  refreshToken: 'sb-refresh-token',
  expiresIn: 3600,
};

function formRequest(params: Record<string, string>, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    body: new URLSearchParams(params).toString(),
  });
}

function buildDeps(overrides?: {
  claimResult?: null | {
    userId: string;
    clientId: string;
    redirectUri: string;
    scope: string | null;
  };
  claimedHashes?: string[];
  unclaimedHashes?: string[];
  refreshResult?: typeof SESSION_TOKENS | null;
  mintResult?: typeof SESSION_TOKENS | null;
  mintThrows?: boolean;
}) {
  const claimedHashes = overrides?.claimedHashes ?? [];
  const unclaimedHashes = overrides?.unclaimedHashes ?? [];
  return {
    getConfig: () => TEST_CONFIG,
    claimAuthorizationCode: async (codeHash: string) => {
      claimedHashes.push(codeHash);
      if (overrides && 'claimResult' in overrides) {
        return overrides.claimResult ?? null;
      }
      return {
        userId: 'user-1',
        clientId: 'merken-chatgpt',
        redirectUri: REDIRECT_URI,
        scope: 'words',
      };
    },
    unclaimAuthorizationCode: async (codeHash: string) => {
      unclaimedHashes.push(codeHash);
    },
    mintSessionForUser: async () => {
      if (overrides?.mintThrows) {
        throw new Error('supabase auth is down');
      }
      return overrides && 'mintResult' in overrides ? (overrides.mintResult ?? null) : SESSION_TOKENS;
    },
    refreshSession: async () =>
      overrides && 'refreshResult' in overrides ? (overrides.refreshResult ?? null) : SESSION_TOKENS,
  };
}

test('token rejects missing client credentials', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({ grant_type: 'authorization_code', code: VALID_CODE }),
    buildDeps(),
  );
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error, 'invalid_client');
});

test('token rejects a wrong client secret', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'authorization_code',
      code: VALID_CODE,
      client_id: 'merken-chatgpt',
      client_secret: 'wrong-secret',
    }),
    buildDeps(),
  );
  assert.equal(response.status, 401);
});

test('token exchanges an authorization code for supabase tokens (form-encoded)', async () => {
  const claimedHashes: string[] = [];
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'authorization_code',
      code: VALID_CODE,
      redirect_uri: REDIRECT_URI,
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps({ claimedHashes }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = await response.json();
  assert.equal(payload.access_token, 'sb-access-token');
  assert.equal(payload.refresh_token, 'sb-refresh-token');
  assert.equal(payload.token_type, 'bearer');
  assert.equal(payload.expires_in, 3600);
  assert.equal(payload.scope, 'words');
  // コードは平文ではなくハッシュで突合される
  assert.deepEqual(claimedHashes, [hashAuthorizationCode(VALID_CODE)]);
});

test('token accepts Basic authorization header credentials', async () => {
  const encoded = Buffer.from('merken-chatgpt:test-secret-value', 'utf8').toString('base64');
  const response = await handleOAuthTokenPost(
    formRequest(
      {
        grant_type: 'authorization_code',
        code: VALID_CODE,
        redirect_uri: REDIRECT_URI,
      },
      { authorization: `Basic ${encoded}` },
    ),
    buildDeps(),
  );
  assert.equal(response.status, 200);
});

test('token returns invalid_grant for an expired or already-used code', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'authorization_code',
      code: VALID_CODE,
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps({ claimResult: null }),
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'invalid_grant');
});

test('token returns invalid_grant when redirect_uri does not match the stored one', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'authorization_code',
      code: VALID_CODE,
      redirect_uri: 'https://chatgpt.com/aip/g-other/oauth/callback',
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps(),
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'invalid_grant');
});

test('token returns invalid_grant when the code user no longer exists', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'authorization_code',
      code: VALID_CODE,
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps({ mintResult: null }),
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'invalid_grant');
});

test('token returns server_error and unclaims the code when session mint hits an infra failure', async () => {
  const unclaimedHashes: string[] = [];
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'authorization_code',
      code: VALID_CODE,
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps({ mintThrows: true, unclaimedHashes }),
  );
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error, 'server_error');
  // 一時障害ではワンタイムコードを消費したままにしない
  assert.deepEqual(unclaimedHashes, [hashAuthorizationCode(VALID_CODE)]);
});

test('token refresh grant returns a new token pair', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'refresh_token',
      refresh_token: 'sb-refresh-token',
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps(),
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.access_token, 'sb-access-token');
  assert.equal(payload.refresh_token, 'sb-refresh-token');
});

test('token refresh grant returns invalid_grant when refresh fails', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'refresh_token',
      refresh_token: 'expired-refresh-token',
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps({ refreshResult: null }),
  );
  assert.equal(response.status, 400);
});

test('token rejects unsupported grant types', async () => {
  const response = await handleOAuthTokenPost(
    formRequest({
      grant_type: 'client_credentials',
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
    buildDeps(),
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error, 'unsupported_grant_type');
});

test('token accepts a JSON body as a fallback', async () => {
  const request = new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: 'sb-refresh-token',
      client_id: 'merken-chatgpt',
      client_secret: 'test-secret-value',
    }),
  });
  const response = await handleOAuthTokenPost(request, buildDeps());
  assert.equal(response.status, 200);
});
