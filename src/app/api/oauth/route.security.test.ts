import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { handleOAuthAuthorizePost } from '@/app/api/oauth/authorize/route';
import { handleOAuthTokenPost } from '@/app/api/oauth/token/route';
import { getChatGptOAuthConfig } from '@/lib/oauth/chatgpt-actions';

const REDIRECT_URI = 'https://chat.openai.com/aip/g-security/oauth/callback';

async function withOAuthEnv<T>(fn: () => Promise<T>): Promise<T> {
  const original = {
    CHATGPT_OAUTH_CLIENT_ID: process.env.CHATGPT_OAUTH_CLIENT_ID,
    CHATGPT_OAUTH_CLIENT_SECRET: process.env.CHATGPT_OAUTH_CLIENT_SECRET,
    CHATGPT_OAUTH_ALLOWED_REDIRECT_URIS: process.env.CHATGPT_OAUTH_ALLOWED_REDIRECT_URIS,
  };

  process.env.CHATGPT_OAUTH_CLIENT_ID = 'security-test-client';
  process.env.CHATGPT_OAUTH_CLIENT_SECRET = 'security-test-secret';
  process.env.CHATGPT_OAUTH_ALLOWED_REDIRECT_URIS = REDIRECT_URI;

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

function tokenRequest(params: Record<string, string>) {
  return new NextRequest('http://localhost/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
}

test('oauth/token returns 401 invalid_client without credentials', async () => {
  await withOAuthEnv(async () => {
    const response = await handleOAuthTokenPost(
      tokenRequest({ grant_type: 'authorization_code', code: 'some-code' }),
    );
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.error, 'invalid_client');
  });
});

test('oauth/token returns 401 invalid_client for a wrong client secret', async () => {
  await withOAuthEnv(async () => {
    const response = await handleOAuthTokenPost(
      tokenRequest({
        grant_type: 'authorization_code',
        code: 'some-code',
        client_id: 'security-test-client',
        client_secret: 'wrong-secret',
      }),
    );
    assert.equal(response.status, 401);
  });
});

test('oauth/token rejects unsupported grant types before touching any data', async () => {
  await withOAuthEnv(async () => {
    const response = await handleOAuthTokenPost(
      tokenRequest({
        grant_type: 'client_credentials',
        client_id: 'security-test-client',
        client_secret: 'security-test-secret',
      }),
    );
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, 'unsupported_grant_type');
  });
});

test('oauth/authorize returns 401 without an authenticated session', async () => {
  await withOAuthEnv(async () => {
    const request = new NextRequest('http://localhost/api/oauth/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'security-test-client', redirectUri: REDIRECT_URI }),
    });
    const response = await handleOAuthAuthorizePost(request, {
      resolveUser: async () => null,
      getConfig: getChatGptOAuthConfig,
      insertAuthorizationCode: async () => {
        throw new Error('must not issue a code for unauthenticated requests');
      },
    });
    assert.equal(response.status, 401);
  });
});

test('oauth/authorize never redirects to a redirect_uri outside the allowlist', async () => {
  await withOAuthEnv(async () => {
    const request = new NextRequest('http://localhost/api/oauth/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: 'security-test-client',
        redirectUri: 'https://attacker.example/oauth/callback',
      }),
    });
    const response = await handleOAuthAuthorizePost(request, {
      resolveUser: async () => ({ id: 'user-1' }),
      getConfig: getChatGptOAuthConfig,
      insertAuthorizationCode: async () => {
        throw new Error('must not issue a code for a disallowed redirect_uri');
      },
    });
    assert.equal(response.status, 400);
  });
});
