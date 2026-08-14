import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TTS_TEXT_LENGTH,
  buildSynthesizeRequestBody,
  synthesizeSpeech,
  validateTtsText,
} from './cloud-text-to-speech';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('APIキーが無いときは not_configured を返し、GCPを呼ばない', async () => {
  let called = false;
  const result = await synthesizeSpeech(
    { text: 'apple', lang: 'en' },
    {
      apiKey: '',
      fetchImpl: async () => {
        called = true;
        return jsonResponse({});
      },
    },
  );

  assert.equal(result.success, false);
  assert.equal(result.success === false && result.reason, 'not_configured');
  assert.match(result.success === false ? result.error : '', /GOOGLE_CLOUD_TTS_API_KEY/);
  assert.equal(called, false);
});

test('空文字と長すぎるテキストは invalid_text で弾く', async () => {
  const deps = { apiKey: 'key', fetchImpl: async () => jsonResponse({ audioContent: 'AAA' }) };

  const empty = await synthesizeSpeech({ text: '   ', lang: 'en' }, deps);
  assert.equal(empty.success === false && empty.reason, 'invalid_text');

  const long = await synthesizeSpeech({ text: 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1), lang: 'en' }, deps);
  assert.equal(long.success === false && long.reason, 'invalid_text');
});

test('validateTtsText は前後の空白を落とし、上限ちょうどは通す', () => {
  assert.equal(validateTtsText('  apple  '), 'apple');
  assert.equal(validateTtsText('a'.repeat(MAX_TTS_TEXT_LENGTH)), 'a'.repeat(MAX_TTS_TEXT_LENGTH));
  assert.equal(validateTtsText('a'.repeat(MAX_TTS_TEXT_LENGTH + 1)), null);
  assert.equal(validateTtsText(undefined), null);
});

test('言語ごとに声を切り替え、mp3 を要求する', () => {
  const en = buildSynthesizeRequestBody({ text: 'apple', lang: 'en' });
  assert.equal(en.voice.languageCode, 'en-US');
  assert.equal(en.audioConfig.audioEncoding, 'MP3');

  const ja = buildSynthesizeRequestBody({ text: 'りんご', lang: 'ja' });
  assert.equal(ja.voice.languageCode, 'ja-JP');
  assert.notEqual(ja.voice.name, en.voice.name);
});

test('成功すると base64 の音声を返す', async () => {
  let requestedUrl = '';
  let sentBody: Record<string, unknown> = {};

  const result = await synthesizeSpeech(
    { text: ' apple ', lang: 'en' },
    {
      apiKey: 'secret-key',
      fetchImpl: async (input, init) => {
        requestedUrl = String(input);
        sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ audioContent: 'bXAz' });
      },
    },
  );

  assert.equal(result.success, true);
  assert.equal(result.success === true && result.audioBase64, 'bXAz');
  assert.match(requestedUrl, /texttospeech\.googleapis\.com/);
  assert.match(requestedUrl, /key=secret-key/);
  // 前後の空白を落としたテキストが送られる
  assert.deepEqual((sentBody.input as { text: string }).text, 'apple');
});

test('GCPがエラーを返したら upstream として扱う', async () => {
  const result = await synthesizeSpeech(
    { text: 'apple', lang: 'en' },
    {
      apiKey: 'key',
      fetchImpl: async () => jsonResponse({ error: { message: 'quota exceeded' } }, 429),
    },
  );

  assert.equal(result.success === false && result.reason, 'upstream');
  assert.equal(result.success === false && result.error, 'quota exceeded');
});

test('音声が空で返ってきたら upstream として扱う', async () => {
  const result = await synthesizeSpeech(
    { text: 'apple', lang: 'en' },
    { apiKey: 'key', fetchImpl: async () => jsonResponse({}) },
  );

  assert.equal(result.success === false && result.reason, 'upstream');
});

test('通信自体が失敗しても例外を投げずに upstream を返す', async () => {
  const result = await synthesizeSpeech(
    { text: 'apple', lang: 'en' },
    {
      apiKey: 'key',
      fetchImpl: async () => {
        throw new Error('network down');
      },
    },
  );

  assert.equal(result.success === false && result.reason, 'upstream');
  assert.equal(result.success === false && result.error, 'network down');
});
