import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeInternalWorkerHeader,
  createInternalWorkerUrl,
  getInternalWorkerAuthorization,
  normalizeInternalWorkerValue,
} from './internal-worker';

test('normalizeInternalWorkerValue trims whitespace and newlines', () => {
  assert.equal(normalizeInternalWorkerValue(' \nworker-token\r\n '), 'worker-token');
  assert.equal(normalizeInternalWorkerValue(undefined), '');
});

test('getInternalWorkerAuthorization prefers dedicated internal worker token', () => {
  const result = getInternalWorkerAuthorization({
    INTERNAL_WORKER_TOKEN: ' dedicated-worker \n',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  });

  assert.deepEqual(result, {
    source: 'INTERNAL_WORKER_TOKEN',
    token: 'dedicated-worker',
    header: 'Bearer dedicated-worker',
  });
});

test('getInternalWorkerAuthorization falls back to service role token', () => {
  const result = getInternalWorkerAuthorization({
    SUPABASE_SERVICE_ROLE_KEY: 'service-role\n',
  });

  assert.deepEqual(result, {
    source: 'SUPABASE_SERVICE_ROLE_KEY',
    token: 'service-role',
    header: 'Bearer service-role',
  });
});

test('authorizeInternalWorkerHeader accepts normalized bearer token', () => {
  const result = authorizeInternalWorkerHeader('Bearer   worker-token  ', {
    INTERNAL_WORKER_TOKEN: '\nworker-token\r\n',
  });

  assert.deepEqual(result, {
    ok: true,
    source: 'INTERNAL_WORKER_TOKEN',
  });
});

test('authorizeInternalWorkerHeader returns missing_header when header is absent', () => {
  const result = authorizeInternalWorkerHeader(null, {
    INTERNAL_WORKER_TOKEN: 'worker-token',
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_header',
  });
});

test('authorizeInternalWorkerHeader returns missing_env when no tokens are configured', () => {
  const result = authorizeInternalWorkerHeader('Bearer worker-token', {});

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_env',
  });
});

test('authorizeInternalWorkerHeader returns mismatch for invalid token', () => {
  const result = authorizeInternalWorkerHeader('Bearer wrong-token', {
    INTERNAL_WORKER_TOKEN: 'worker-token',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
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
