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

function createClient(
  user: { id: string } | null = { id: 'user-1' },
  usage: Record<string, unknown> = { allowed: true, requires_pro: false, current_count: 1, limit: 30, is_pro: false },
) {
  return {
    auth: {
      getUser: async (token?: string) => ({
        data: { user },
        error: null,
        token,
      }),
    },
    rpc: async () => ({ data: usage, error: null }),
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
      recognize: async () => ({ success: true, transcript: 'clarify', confidence: 0.9, alternatives: ['clarify'] }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json() as { success: boolean; transcript: string };
  assert.equal(payload.success, true);
  assert.equal(payload.transcript, 'clarify');
});

test('voice-quiz recognize surfaces a 502 when Cloud Speech-to-Text itself fails', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({ success: false, reason: 'upstream', error: 'API key not valid' }),
    },
  );

  assert.equal(response.status, 502);
  const payload = await response.json() as { success: boolean; error: string };
  assert.equal(payload.success, false);
});

test('voice-quiz recognize reports a missing API key as 500, not 502', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({
        success: false,
        reason: 'not_configured',
        error: 'GOOGLE_CLOUD_SPEECH_API_KEY が設定されていません',
      }),
    },
  );

  // 設定ミスは上流障害ではない。502だと「GCPが落ちている」と誤読される。
  assert.equal(response.status, 500);
});

test('voice-quiz recognize never leaks the internal error to the client', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => ({
        success: false,
        reason: 'not_configured',
        error: 'GOOGLE_CLOUD_SPEECH_API_KEY が設定されていません',
      }),
    },
  );

  const payload = await response.json() as { error: string };
  assert.doesNotMatch(payload.error, /GOOGLE_CLOUD_SPEECH_API_KEY/);
});

/**
 * 上限に達したことは、クイズ画面が `limitReached` で見分けて出題を止める。
 * ここを success:false の一般的な失敗に丸めると、残りの問題が黙って
 * 全部「認識に失敗」になり、原因が画面から分からなくなる。
 */
test('voice-quiz recognize marks the daily limit so the quiz can stop instead of failing every question', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient(
        { id: 'user-1' },
        { allowed: false, requires_pro: false, current_count: 30, limit: 30, is_pro: false },
      ) as never,
      recognize: async () => {
        throw new Error('recognize should not run once the limit is reached');
      },
    },
  );

  assert.equal(response.status, 429);
  const payload = await response.json() as { success: boolean; error: string; limitReached: boolean };
  assert.equal(payload.success, false);
  assert.equal(payload.limitReached, true);
  // 回数が入っていないと、何回でやめさせられたのか画面に出せない。
  assert.match(payload.error, /30/);
});

/**
 * iOS Safari は mp4(AAC) でしか録音できず、GCPはAACを受け取れない。
 * クライアントで生PCMに直して送るので、この経路が閉じているとスマホでは
 * 1問も認識できない。
 */
test('voice-quiz recognize accepts converted LINEAR16 audio with its sample rate', async () => {
  let seen: Record<string, unknown> | null = null;

  const response = await handleVoiceQuizRecognizePost(
    jsonRequest(
      { audioBase64: 'AAAA', encoding: 'LINEAR16', sampleRateHertz: 16000 },
      { authorization: 'Bearer token-1' },
    ),
    {
      createClient: async () => createClient() as never,
      recognize: async (input) => {
        seen = input as unknown as Record<string, unknown>;
        return { success: true, transcript: '入念に作り上げる', confidence: 0.8, alternatives: [] };
      },
    },
  );

  assert.equal(response.status, 200);
  // レートを落とすと、GCPは生PCMを別の速さで読んで必ず外す。
  assert.equal(seen!.encoding, 'LINEAR16');
  assert.equal(seen!.sampleRateHertz, 16000);
});

test('voice-quiz recognize rejects LINEAR16 without a sample rate', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest({ audioBase64: 'AAAA', encoding: 'LINEAR16' }, { authorization: 'Bearer token-1' }),
    {
      createClient: async () => createClient() as never,
      recognize: async () => {
        throw new Error('recognize should not run without a sample rate');
      },
    },
  );

  assert.equal(response.status, 400);
});

test('voice-quiz recognize refuses a sample rate outside what GCP takes', async () => {
  const response = await handleVoiceQuizRecognizePost(
    jsonRequest(
      { audioBase64: 'AAAA', encoding: 'LINEAR16', sampleRateHertz: 192000 },
      { authorization: 'Bearer token-1' },
    ),
    {
      createClient: async () => createClient() as never,
      recognize: async () => {
        throw new Error('recognize should not run');
      },
    },
  );

  assert.equal(response.status, 400);
});
