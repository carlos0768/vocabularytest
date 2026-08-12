import test from 'node:test';
import assert from 'node:assert/strict';

import { recognizeSpeech } from './cloud-speech-to-text';

function fakeFetch(response: { ok: boolean; status?: number; body: unknown }): typeof fetch {
  return (async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.body,
  })) as unknown as typeof fetch;
}

test('recognizeSpeech fails fast when the API key is missing', async () => {
  const result = await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS' },
    { apiKey: undefined, fetchImpl: fakeFetch({ ok: true, body: {} }) },
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error, /GOOGLE_CLOUD_SPEECH_API_KEY/);
  }
});

test('recognizeSpeech fails when audio is empty', async () => {
  const result = await recognizeSpeech(
    { audioBase64: '', encoding: 'WEBM_OPUS' },
    { apiKey: 'test-key', fetchImpl: fakeFetch({ ok: true, body: {} }) },
  );

  assert.equal(result.success, false);
});

test('recognizeSpeech returns the top transcript and confidence on success', async () => {
  const result = await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS' },
    {
      apiKey: 'test-key',
      fetchImpl: fakeFetch({
        ok: true,
        body: {
          results: [
            { alternatives: [{ transcript: 'clarify', confidence: 0.92 }] },
          ],
        },
      }),
    },
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.transcript, 'clarify');
    assert.equal(result.confidence, 0.92);
  }
});

test('recognizeSpeech returns an empty transcript when GCP found no speech', async () => {
  const result = await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS' },
    { apiKey: 'test-key', fetchImpl: fakeFetch({ ok: true, body: { results: [] } }) },
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.transcript, '');
  }
});

test('recognizeSpeech surfaces the GCP error message on non-200 responses', async () => {
  const result = await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS' },
    {
      apiKey: 'bad-key',
      fetchImpl: fakeFetch({ ok: false, status: 403, body: { error: { message: 'API key not valid' } } }),
    },
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error, 'API key not valid');
  }
});
