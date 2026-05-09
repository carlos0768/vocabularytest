import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeInternalWorkerHeader,
  createInternalWorkerUrl,
  getInternalWorkerAuthorization,
  normalizeInternalWorkerValue,
} from './internal-worker';

const dummy = {
  workerCredential: 'dummy-internal-worker-credential',
  serviceRoleCredential: 'dummy-service-role-credential',
} as const;

test('normalizeInternalWorkerValue trims whitespace and newlines', () => {
  assert.equal(
    normalizeInternalWorkerValue(` \n${dummy.workerCredential}\r\n `),
    dummy.workerCredential,
  );
  assert.equal(normalizeInternalWorkerValue(undefined), '');
});

test('getInternalWorkerAuthorization prefers dedicated internal worker token', () => {
  const result = getInternalWorkerAuthorization({
    INTERNAL_WORKER_TOKEN: ` ${dummy.workerCredential} \n`,
    SUPABASE_SERVICE_ROLE_KEY: dummy.serviceRoleCredential,
  });

  assert.deepEqual(result, {
    source: 'INTERNAL_WORKER_TOKEN',
    token: dummy.workerCredential,
    header: `Bearer ${dummy.workerCredential}`,
  });
});

test('getInternalWorkerAuthorization falls back to service role token', () => {
  const result = getInternalWorkerAuthorization({
    SUPABASE_SERVICE_ROLE_KEY: `${dummy.serviceRoleCredential}\n`,
  });

  assert.deepEqual(result, {
    source: 'SUPABASE_SERVICE_ROLE_KEY',
    token: dummy.serviceRoleCredential,
    header: `Bearer ${dummy.serviceRoleCredential}`,
  });
});

test('authorizeInternalWorkerHeader accepts normalized bearer token', () => {
  const result = authorizeInternalWorkerHeader(`Bearer   ${dummy.workerCredential}  `, {
    INTERNAL_WORKER_TOKEN: `\n${dummy.workerCredential}\r\n`,
  });

  assert.deepEqual(result, {
    ok: true,
    source: 'INTERNAL_WORKER_TOKEN',
  });
});

test('authorizeInternalWorkerHeader returns missing_header when header is absent', () => {
  const result = authorizeInternalWorkerHeader(null, {
    INTERNAL_WORKER_TOKEN: dummy.workerCredential,
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_header',
  });
});

test('authorizeInternalWorkerHeader returns missing_env when no tokens are configured', () => {
  const result = authorizeInternalWorkerHeader(`Bearer ${dummy.workerCredential}`, {});

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_env',
  });
});

test('authorizeInternalWorkerHeader returns mismatch for invalid token', () => {
  const result = authorizeInternalWorkerHeader('Bearer wrong-token', {
    INTERNAL_WORKER_TOKEN: dummy.workerCredential,
    SUPABASE_SERVICE_ROLE_KEY: dummy.serviceRoleCredential,
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'mismatch',
  });
});

test('createInternalWorkerUrl prefers VERCEL_URL when available', () => {
  const url = createInternalWorkerUrl('/api/word-lexicon-resolution/process', 'https://public.example.com/foo', {
    VERCEL_URL: 'internal.example.vercel.app\n',
  });

  assert.equal(url.toString(), 'https://internal.example.vercel.app/api/word-lexicon-resolution/process');
});
