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
    assert.equal(result.reason, 'not_configured');
    assert.match(result.error, /GOOGLE_CLOUD_SPEECH_API_KEY/);
  }
});

test('recognizeSpeech treats a whitespace-only API key as unset', async () => {
  const result = await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS' },
    { apiKey: '  \n', fetchImpl: fakeFetch({ ok: true, body: {} }) },
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.reason, 'not_configured');
  }
});

test('recognizeSpeech trims a pasted API key before calling GCP', async () => {
  let calledUrl = '';
  const fetchImpl = (async (url: string) => {
    calledUrl = url;
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  }) as unknown as typeof fetch;

  await recognizeSpeech({ audioBase64: 'AAAA', encoding: 'WEBM_OPUS' }, { apiKey: ' key-1\n', fetchImpl });

  assert.match(calledUrl, /key=key-1$/);
});

test('recognizeSpeech fails when audio is empty', async () => {
  const result = await recognizeSpeech(
    { audioBase64: '', encoding: 'WEBM_OPUS' },
    { apiKey: 'test-key', fetchImpl: fakeFetch({ ok: true, body: {} }) },
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.reason, 'invalid_audio');
  }
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

/** 送信したリクエストボディを覗くための fetch。 */
function capturingFetch(body: unknown) {
  const seen: { url: string; payload: Record<string, never> | undefined } = { url: '', payload: undefined };
  const fetchImpl = (async (url: string, init: { body: string }) => {
    seen.url = url;
    seen.payload = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

test('recognizeSpeech passes phrase hints to GCP as a speech context', async () => {
  const { fetchImpl, seen } = capturingFetch({ results: [] });

  await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS', phraseHints: ['気づく', '  ', '認識する'] },
    { apiKey: 'test-key', fetchImpl },
  );

  const config = (seen.payload as unknown as { config: Record<string, unknown> }).config;
  const [context] = config.speechContexts as Array<{ phrases: string[]; boost?: number }>;
  assert.deepEqual(context.phrases, ['気づく', '認識する']);
  // boost が付いていないとヒントはほとんど効かず、同音異義語の変換先が寄らない。
  assert.ok(typeof context.boost === 'number' && context.boost > 0, `boost missing: ${context.boost}`);
});

test('recognizeSpeech omits speechContexts when there is nothing to hint', async () => {
  const { fetchImpl, seen } = capturingFetch({ results: [] });

  await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS', phraseHints: ['   '] },
    { apiKey: 'test-key', fetchImpl },
  );

  const config = (seen.payload as unknown as { config: Record<string, unknown> }).config;
  assert.equal('speechContexts' in config, false);
});

test('recognizeSpeech clamps maxAlternatives into the range GCP accepts', async () => {
  for (const [requested, expected] of [[5, 5], [0, 1], [999, 30]] as const) {
    const { fetchImpl, seen } = capturingFetch({ results: [] });
    await recognizeSpeech(
      { audioBase64: 'AAAA', encoding: 'WEBM_OPUS', maxAlternatives: requested },
      { apiKey: 'test-key', fetchImpl },
    );
    const config = (seen.payload as unknown as { config: Record<string, unknown> }).config;
    assert.equal(config.maxAlternatives, expected);
  }
});

test('recognizeSpeech returns every alternative so homophones can be checked', async () => {
  const result = await recognizeSpeech(
    { audioBase64: 'AAAA', encoding: 'WEBM_OPUS' },
    {
      apiKey: 'test-key',
      fetchImpl: fakeFetch({
        ok: true,
        body: {
          results: [
            {
              alternatives: [
                { transcript: '築く', confidence: 0.8 },
                { transcript: '気づく', confidence: 0.7 },
                { transcript: '気づく' },
              ],
            },
          ],
        },
      }),
    },
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.transcript, '築く');
    // 重複は畳んだうえで、同音の別変換を残す。
    assert.deepEqual(result.alternatives, ['築く', '気づく']);
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
    assert.equal(result.reason, 'upstream');
    assert.equal(result.error, 'API key not valid');
  }
});
