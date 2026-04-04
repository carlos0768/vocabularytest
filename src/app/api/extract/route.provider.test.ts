import test from 'node:test';
import assert from 'node:assert/strict';

import { __internal } from '@/app/api/extract/route';
import { AI_CONFIG } from '@/lib/ai/config';

function withCloudRunEnv<T>(url: string | undefined, token: string | undefined, run: () => T): T {
  const originalUrl = process.env.CLOUD_RUN_URL;
  const originalToken = process.env.CLOUD_RUN_AUTH_TOKEN;

  if (url === undefined) delete process.env.CLOUD_RUN_URL;
  else process.env.CLOUD_RUN_URL = url;

  if (token === undefined) delete process.env.CLOUD_RUN_AUTH_TOKEN;
  else process.env.CLOUD_RUN_AUTH_TOKEN = token;

  try {
    return run();
  } finally {
    if (originalUrl === undefined) delete process.env.CLOUD_RUN_URL;
    else process.env.CLOUD_RUN_URL = originalUrl;

    if (originalToken === undefined) delete process.env.CLOUD_RUN_AUTH_TOKEN;
    else process.env.CLOUD_RUN_AUTH_TOKEN = originalToken;
  }
}

test('Cloud Run configured mode does not require direct provider key', () => {
  withCloudRunEnv('https://scan.example.run.app', 'token-123', () => {
    const missing = __internal.getMissingProviderKey('all', { gemini: undefined, openai: undefined });
    assert.equal(missing, null);
  });
});

test('Without Cloud Run, missing gemini key is reported for all mode', () => {
  withCloudRunEnv(undefined, undefined, () => {
    const missing = __internal.getMissingProviderKey('all', { gemini: undefined, openai: undefined });
    assert.equal(missing, 'gemini');
  });
});

test('idiom mode resolves provider from idioms config', () => {
  withCloudRunEnv(undefined, undefined, () => {
    const providers = __internal.getProvidersForMode('idiom');
    assert.deepEqual(providers, [AI_CONFIG.extraction.idioms.provider]);
  });
});
