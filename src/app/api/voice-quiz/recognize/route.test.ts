import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { handleVoiceQuizRecognizePost } from './route';

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/voice-quiz/recognize', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createClient(user: { id: string } | null = { id: 'user-1' }) {
  return {
    auth: {
      getUser: async (token?: string) => ({
        data: { user },
        error: null,
        token,
      }),
    },
    rpc: async () => ({
      data: { allowed: true, requires_pro: false, current_count: 1, limit: 30, is_pro: false },
      error: null,
    }),
  };
}

test('voice-quiz recognize requires an authenticated user', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }),
    {
      createClient: async () => createClient(null) as never,
      recognize: async () => {
        throw new Error('recognize should not run');
      },
    },
  );

  assert.equal(response.status, 401);
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.success, false);
});

test('voice-quiz recognize validates the request body', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: '', encoding: 'WEBM_OPUS' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => {
        throw new Error('recognize should not run');
      },
    },
  );

  assert.equal(response.status, 400);
});

test('voice-quiz recognize returns the transcript on success', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({ success: true, transcript: 'clarify', confidence: 0.9 }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json() as { success: boolean; transcript: string };
  assert.equal(payload.success, true);
  assert.equal(payload.transcript, 'clarify');
});

test('voice-quiz recognize surfaces a 502 when Cloud Speech-to-Text fails', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({ success: false, error: 'GOOGLE_CLOUD_SPEECH_API_KEY が設定されていません' }),
    },
  );

  assert.equal(response.status, 502);
  const payload = await response.json() as { success: boolean; error: string };
  assert.equal(payload.success, false);
});
