import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { handleWordVoiceInputPost } from './route';

function jsonRequest(body: unknown, headers: Record<string, string> = { authorization: 'Bearer token-1' }) {
  return new NextRequest('http://localhost/api/words/voice-input', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function createClient(
  user: { id: string } | null = { id: 'user-1' },
  usage: Record<string, unknown> = { allowed: true, requires_pro: false, current_count: 1, limit: 10, is_pro: false },
  onRpc?: (name: string, params: Record<string, unknown>) => void,
) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    rpc: async (name: string, params: Record<string, unknown>) => {
      onRpc?.(name, params);
      return { data: usage, error: null };
    },
  };
}

const neverRecognize = async () => {
  throw new Error('recognize should not run');
};

test('word voice input requires an authenticated user', async () => {
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, {}),
    { createClient: async () => createClient(null) as never, recognize: neverRecognize },
  );
  assert.equal(response.status, 401);
});

test('word voice input rejects LINEAR16 without a sample rate before counting usage', async () => {
  let rpcCalls = 0;
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'LINEAR16' }),
    {
      createClient: async () => createClient(undefined, undefined, () => { rpcCalls += 1; }) as never,
      recognize: neverRecognize,
    },
  );
  assert.equal(response.status, 400);
  assert.equal(rpcCalls, 0);
});

test('word voice input recognizes in English and Japanese and returns one word', async () => {
  const languages: string[] = [];
  let resolvedWith: unknown;
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
    {
      createClient: async () => createClient() as never,
      recognize: async (input) => {
        languages.push(input.languageCode ?? '');
        return input.languageCode === 'ja-JP'
          ? { success: true, transcript: 'アップル', confidence: 0.8, alternatives: ['アップル'] }
          : { success: true, transcript: 'a pole', confidence: 0.4, alternatives: ['a pole', 'a pull'] };
      },
      resolveEntry: async (candidates) => {
        resolvedWith = candidates;
        return 'apple';
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(languages.sort(), ['en-US', 'ja-JP']);
  assert.deepEqual(resolvedWith, {
    english: ['a pole', 'a pull'],
    englishConfidence: 0.4,
    japanese: ['アップル'],
  });
  const payload = await response.json() as { success: boolean; word: string | null };
  assert.equal(payload.success, true);
  assert.equal(payload.word, 'apple');
});

test('word voice input keeps going when only the Japanese recognizer fails', async () => {
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
    {
      createClient: async () => createClient() as never,
      recognize: async (input) => (input.languageCode === 'ja-JP'
        ? { success: false, reason: 'upstream', error: 'boom' }
        : { success: true, transcript: 'beautiful', confidence: 0.95, alternatives: ['beautiful'] }),
      resolveEntry: async (candidates) => candidates.english[0] ?? null,
    },
  );
  const payload = await response.json() as { success: boolean; word: string | null };
  assert.equal(response.status, 200);
  assert.equal(payload.word, 'beautiful');
});

test('word voice input returns no word when nothing was heard', async () => {
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({ success: true, transcript: '', confidence: 0, alternatives: [] }),
      resolveEntry: async () => {
        throw new Error('resolve should not run');
      },
    },
  );
  const payload = await response.json() as { success: boolean; word: string | null };
  assert.equal(payload.success, true);
  assert.equal(payload.word, null);
});

test('word voice input maps recognizer failures without leaking details', async () => {
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({ success: false, reason: 'not_configured', error: 'GOOGLE_CLOUD_SPEECH_API_KEY が設定されていません' }),
    },
  );
  assert.equal(response.status, 500);
  const payload = await response.json() as { error: string };
  assert.doesNotMatch(payload.error, /GOOGLE_CLOUD_SPEECH_API_KEY/);
});

test('word voice input stops at the daily limit', async () => {
  const previous = process.env.ENABLE_AI_USAGE_LIMITS;
  process.env.ENABLE_AI_USAGE_LIMITS = 'true';
  try {
    let featureKey: unknown;
    const response = await handleWordVoiceInputPost(
      jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
      {
        createClient: async () => createClient(
          undefined,
          { allowed: false, requires_pro: false, current_count: 10, limit: 10, is_pro: false },
          (_name, params) => { featureKey = params.p_feature_key; },
        ) as never,
        recognize: neverRecognize,
      },
    );
    assert.equal(response.status, 429);
    assert.equal(featureKey, 'word_voice_input');
  } finally {
    if (previous === undefined) delete process.env.ENABLE_AI_USAGE_LIMITS;
    else process.env.ENABLE_AI_USAGE_LIMITS = previous;
  }
});
