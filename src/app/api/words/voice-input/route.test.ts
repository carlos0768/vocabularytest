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

test('word voice input recognizes English and returns the split word list', async () => {
  let languageCode: string | undefined;
  let splitInput = '';
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
    {
      createClient: async () => createClient() as never,
      recognize: async (input) => {
        languageCode = input.languageCode;
        return {
          success: true,
          transcript: 'apple look forward to',
          confidence: 0.9,
          alternatives: [],
          // 長い発話は結果が分かれる。後半を落とさずにつなぐこと。
          segments: ['apple look forward to', 'beautiful'],
        };
      },
      splitTranscript: async (transcript) => {
        splitInput = transcript;
        return ['apple', 'look forward to', 'beautiful'];
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(languageCode, 'en-US');
  assert.equal(splitInput, 'apple look forward to beautiful');
  const payload = await response.json() as { success: boolean; words: string[] };
  assert.equal(payload.success, true);
  assert.deepEqual(payload.words, ['apple', 'look forward to', 'beautiful']);
});

test('word voice input returns an empty list when nothing was heard', async () => {
  const response = await handleWordVoiceInputPost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({ success: true, transcript: '', confidence: 0, alternatives: [] }),
      splitTranscript: async () => {
        throw new Error('split should not run');
      },
    },
  );
  const payload = await response.json() as { success: boolean; words: string[] };
  assert.equal(payload.success, true);
  assert.deepEqual(payload.words, []);
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
