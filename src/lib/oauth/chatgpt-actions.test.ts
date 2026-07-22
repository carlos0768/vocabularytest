import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAuthorizationRedirectUrl,
  extractClientCredentials,
  generateAuthorizationCode,
  getChatGptOAuthConfig,
  hashAuthorizationCode,
  isAllowedRedirectUri,
  isChatGptOAuthConfigured,
  parseAllowedRedirectUris,
  secretsMatch,
  validateClientCredentials,
} from './chatgpt-actions';

const TEST_CONFIG = {
  clientId: 'merken-chatgpt',
  clientSecret: 'test-secret-value',
  allowedRedirectUris: [
    'https://chat.openai.com/aip/g-abc123/oauth/callback',
    'https://chatgpt.com/aip/g-abc123/oauth/callback',
  ],
};

test('parseAllowedRedirectUris splits, trims, and drops empty entries', () => {
  assert.deepEqual(
    parseAllowedRedirectUris(' https://a.example/cb , https://b.example/cb ,, '),
    ['https://a.example/cb', 'https://b.example/cb'],
  );
  assert.deepEqual(parseAllowedRedirectUris(''), []);
  assert.deepEqual(parseAllowedRedirectUris(null), []);
});

test('getChatGptOAuthConfig reads values from env and reports configured state', () => {
  const config = getChatGptOAuthConfig({
    CHATGPT_OAUTH_CLIENT_ID: 'merken-chatgpt',
    CHATGPT_OAUTH_CLIENT_SECRET: 'secret',
    CHATGPT_OAUTH_ALLOWED_REDIRECT_URIS: 'https://chat.openai.com/aip/g-x/oauth/callback',
  });
  assert.equal(config.clientId, 'merken-chatgpt');
  assert.equal(config.clientSecret, 'secret');
  assert.deepEqual(config.allowedRedirectUris, ['https://chat.openai.com/aip/g-x/oauth/callback']);
  assert.equal(isChatGptOAuthConfigured(config), true);

  const empty = getChatGptOAuthConfig({});
  assert.equal(isChatGptOAuthConfigured(empty), false);
});

test('isAllowedRedirectUri requires exact match', () => {
  assert.equal(
    isAllowedRedirectUri('https://chat.openai.com/aip/g-abc123/oauth/callback', TEST_CONFIG.allowedRedirectUris),
    true,
  );
  assert.equal(
    isAllowedRedirectUri('https://chat.openai.com/aip/g-abc123/oauth/callback/extra', TEST_CONFIG.allowedRedirectUris),
    false,
  );
  assert.equal(
    isAllowedRedirectUri('https://evil.example/aip/g-abc123/oauth/callback', TEST_CONFIG.allowedRedirectUris),
    false,
  );
  assert.equal(isAllowedRedirectUri('', TEST_CONFIG.allowedRedirectUris), false);
});

test('generateAuthorizationCode returns unique url-safe codes', () => {
  const first = generateAuthorizationCode();
  const second = generateAuthorizationCode();
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first, second);
});

test('hashAuthorizationCode is deterministic and never echoes the code', () => {
  const code = generateAuthorizationCode();
  const hash = hashAuthorizationCode(code);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashAuthorizationCode(code));
  assert.notEqual(hash.includes(code), true);
});

test('secretsMatch compares safely and rejects empty/length-mismatch values', () => {
  assert.equal(secretsMatch('secret', 'secret'), true);
  assert.equal(secretsMatch('secret', 'secreT'), false);
  assert.equal(secretsMatch('secret', 'secret-longer'), false);
  assert.equal(secretsMatch('', ''), false);
});

test('extractClientCredentials reads POST body credentials', () => {
  const credentials = extractClientCredentials({
    bodyClientId: 'merken-chatgpt',
    bodyClientSecret: 'test-secret-value',
    authorizationHeader: null,
  });
  assert.deepEqual(credentials, { clientId: 'merken-chatgpt', clientSecret: 'test-secret-value' });
});

test('extractClientCredentials prefers Basic authorization header', () => {
  const encoded = Buffer.from('merken-chatgpt:test-secret-value', 'utf8').toString('base64');
  const credentials = extractClientCredentials({
    bodyClientId: null,
    bodyClientSecret: null,
    authorizationHeader: `Basic ${encoded}`,
  });
  assert.deepEqual(credentials, { clientId: 'merken-chatgpt', clientSecret: 'test-secret-value' });
});

test('extractClientCredentials returns null when nothing is provided', () => {
  assert.equal(extractClientCredentials({}), null);
  assert.equal(extractClientCredentials({ bodyClientId: 'id-only' }), null);
});

test('validateClientCredentials accepts only the configured pair', () => {
  assert.equal(
    validateClientCredentials(
      { clientId: 'merken-chatgpt', clientSecret: 'test-secret-value' },
      TEST_CONFIG,
    ),
    true,
  );
  assert.equal(
    validateClientCredentials(
      { clientId: 'merken-chatgpt', clientSecret: 'wrong' },
      TEST_CONFIG,
    ),
    false,
  );
  assert.equal(
    validateClientCredentials(
      { clientId: 'other-client', clientSecret: 'test-secret-value' },
      TEST_CONFIG,
    ),
    false,
  );
  assert.equal(validateClientCredentials(null, TEST_CONFIG), false);
  assert.equal(
    validateClientCredentials(
      { clientId: '', clientSecret: '' },
      { clientId: '', clientSecret: '', allowedRedirectUris: [] },
    ),
    false,
  );
});

test('buildAuthorizationRedirectUrl appends code/error/state', () => {
  const success = buildAuthorizationRedirectUrl({
    redirectUri: 'https://chat.openai.com/aip/g-abc123/oauth/callback',
    code: 'auth-code',
    state: 'xyz',
  });
  const successUrl = new URL(success);
  assert.equal(successUrl.searchParams.get('code'), 'auth-code');
  assert.equal(successUrl.searchParams.get('state'), 'xyz');

  const denied = buildAuthorizationRedirectUrl({
    redirectUri: 'https://chat.openai.com/aip/g-abc123/oauth/callback',
    error: 'access_denied',
    state: 'xyz',
  });
  const deniedUrl = new URL(denied);
  assert.equal(deniedUrl.searchParams.get('error'), 'access_denied');
  assert.equal(deniedUrl.searchParams.get('code'), null);
});
