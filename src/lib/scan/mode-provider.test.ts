import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getMissingProviderKey,
  getMissingProviderKeyForModes,
  getProvidersForMode,
  getProvidersForModes,
  normalizeExtractModes,
  requiresProForModes,
  type ExtractMode,
} from '@/lib/scan/mode-provider';
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

test('scan mode maps to configured extraction provider', () => {
  const cases: Array<[ExtractMode, string]> = [
    ['all', AI_CONFIG.extraction.words.provider],
    ['circled', AI_CONFIG.extraction.circled.provider],
    ['eiken', AI_CONFIG.extraction.eiken.provider],
    ['idiom', AI_CONFIG.extraction.idioms.provider],
  ];

  for (const [mode, provider] of cases) {
    assert.deepEqual(getProvidersForMode(mode), [provider], `mode=${mode}`);
  }
});

test('normalizeExtractModes accepts arrays, JSON strings, and comma strings', () => {
  assert.deepEqual(normalizeExtractModes(['all', 'idiom', 'all']), ['all', 'idiom']);
  assert.deepEqual(normalizeExtractModes('["circled","eiken"]'), ['circled', 'eiken']);
  assert.deepEqual(normalizeExtractModes('all,idiom,unknown'), ['all', 'idiom']);
  assert.deepEqual(normalizeExtractModes('unknown', ['all']), ['all']);
});

test('multiple scan modes use the composite extraction provider and Pro gate', () => {
  assert.deepEqual(getProvidersForModes(['all', 'idiom']), [AI_CONFIG.extraction.words.provider]);
  assert.equal(requiresProForModes(['all']), false);
  assert.equal(requiresProForModes(['all', 'idiom']), true);
});

test('Cloud Run configured mode does not require direct provider key', () => {
  withCloudRunEnv('https://scan.example.run.app', 'token-123', () => {
    const modes: ExtractMode[] = ['all', 'circled', 'eiken', 'idiom'];

    for (const mode of modes) {
      const missing = getMissingProviderKey(mode, { gemini: undefined, openai: undefined });
      assert.equal(missing, null, `mode=${mode}`);
    }
  });
});

test('Without Cloud Run, missing configured provider key is reported', () => {
  withCloudRunEnv(undefined, undefined, () => {
    const modes: ExtractMode[] = ['all', 'circled', 'eiken', 'idiom'];

    for (const mode of modes) {
      const provider = getProvidersForMode(mode)[0];
      const missing = getMissingProviderKey(mode, { gemini: undefined, openai: undefined });
      assert.equal(missing, provider, `mode=${mode}`);
    }
  });
});

test('Without Cloud Run, missing composite provider key is reported once for multiple modes', () => {
  withCloudRunEnv(undefined, undefined, () => {
    const missing = getMissingProviderKeyForModes(['all', 'idiom'], {
      gemini: undefined,
      openai: undefined,
    });
    assert.equal(missing, AI_CONFIG.extraction.words.provider);
  });
});

test('Without Cloud Run, present configured provider key is accepted', () => {
  withCloudRunEnv(undefined, undefined, () => {
    const modes: ExtractMode[] = ['all', 'circled', 'eiken', 'idiom'];

    for (const mode of modes) {
      const provider = getProvidersForMode(mode)[0];
      const keys = provider === 'gemini'
        ? { gemini: 'test-gemini-key', openai: undefined }
        : { gemini: undefined, openai: 'test-openai-key' };

      assert.equal(getMissingProviderKey(mode, keys), null, `mode=${mode}`);
    }
  });
});
