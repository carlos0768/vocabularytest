import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LINEAR16_SAMPLE_RATE,
  bytesToBase64,
  floatsToPcm16,
  mixToMono,
  passthroughEncodingFor,
  resampleMono,
  trimSilence,
} from './recorded-audio';

test('opus containers are sent as they are', () => {
  assert.equal(passthroughEncodingFor('audio/webm;codecs=opus'), 'WEBM_OPUS');
  assert.equal(passthroughEncodingFor('audio/webm'), 'WEBM_OPUS');
  assert.equal(passthroughEncodingFor('audio/ogg;codecs=opus'), 'OGG_OPUS');
});

/**
 * iOS Safari は webm を「対応している」と答えたうえで mp4 を吐く。
 * ここが passthrough を返すと、GCPが受け取れないAACをそのまま送って
 * 全問失敗する —— スマホだけ音声認識ができなかった原因。
 */
test('mp4 is not sent as it is — it has to be converted', () => {
  assert.equal(passthroughEncodingFor('audio/mp4'), null);
  assert.equal(passthroughEncodingFor('audio/mp4;codecs=mp4a.40.2'), null);
  assert.equal(passthroughEncodingFor(''), null);
});

test('channels are averaged into one', () => {
  const left = new Float32Array([1, 0, -1]);
  const right = new Float32Array([0, 0, 1]);
  assert.deepEqual([...mixToMono([left, right])], [0.5, 0, 0]);
});

test('a mono recording is passed through untouched', () => {
  const mono = new Float32Array([0.25, -0.25]);
  assert.equal(mixToMono([mono]), mono);
});

test('resampling to a lower rate keeps the duration', () => {
  const samples = new Float32Array(48000); // 48kHzで1秒
  const resampled = resampleMono(samples, 48000, LINEAR16_SAMPLE_RATE);
  assert.equal(resampled.length, LINEAR16_SAMPLE_RATE);
});

test('resampling interpolates between neighbours instead of dropping to zero', () => {
  const samples = new Float32Array([0, 1, 0, 1]);
  const resampled = resampleMono(samples, 4, 2);
  assert.equal(resampled.length, 2);
  assert.deepEqual([...resampled], [0, 0]);

  // 上げる向きでは、間の値が両隣から作られる (1Hzで2サンプル = 2秒 → 2Hzで4サンプル)。
  const up = resampleMono(new Float32Array([0, 1]), 1, 2);
  assert.deepEqual([...up], [0, 0.5, 1, 1]);
});

test('an equal rate is a no-op, and nonsense rates yield nothing', () => {
  const samples = new Float32Array([0.5]);
  assert.equal(resampleMono(samples, 16000, 16000), samples);
  assert.equal(resampleMono(samples, 0, 16000).length, 0);
  assert.equal(resampleMono(samples, 16000, Number.NaN).length, 0);
});

test('samples become 16-bit little-endian pcm', () => {
  const pcm = floatsToPcm16(new Float32Array([0, 1, -1]));
  assert.equal(pcm.length, 6);

  const view = new DataView(pcm.buffer);
  assert.equal(view.getInt16(0, true), 0);
  assert.equal(view.getInt16(2, true), 32767);
  assert.equal(view.getInt16(4, true), -32767);
  // リトルエンディアンであること。逆に読めば別の値になる。
  assert.notEqual(view.getInt16(2, false), 32767);
});

/**
 * デコード結果は -1〜1 に収まる保証が無い。そのまま量子化すると
 * 大きい音が反対の極に折り返り、雑音になって認識できなくなる。
 */
test('out-of-range samples are clamped, not wrapped', () => {
  const view = new DataView(floatsToPcm16(new Float32Array([2, -2])).buffer);
  assert.equal(view.getInt16(0, true), 32767);
  assert.equal(view.getInt16(2, true), -32767);
});

/**
 * 6秒ぶんの録音でも数万バイトになる。スプレッド展開で base64 にしていた
 * 頃は、そこで引数の上限に当たって RangeError になり、送信前に落ちていた ——
 * PCでは通り、スマホだけ「音声認識に失敗しました」になる形で出る。
 */
test('base64 encoding survives a recording far past any argument limit', () => {
  const bytes = new Uint8Array(200_000);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;

  const encoded = bytesToBase64(bytes);
  assert.equal(encoded, Buffer.from(bytes).toString('base64'));
});

test('base64 encoding matches for the awkward lengths around a chunk boundary', () => {
  for (const length of [0, 1, 2, 3, 32767, 32768, 32769, 65536]) {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) bytes[i] = (i * 7) % 256;
    assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'), `length ${length}`);
  }
});

/**
 * 録音の窓は解答時間ぶん開いているが、話しているのはその一部。
 * 生PCMは圧縮が効かないので、無音がそのまま送信量になる。
 */
test('silence around the answer is trimmed away', () => {
  const rate = 16000;
  const samples = new Float32Array(rate * 6); // 6秒の窓
  // 2.0〜2.5秒のところだけ声が入っている。
  for (let i = rate * 2; i < rate * 2.5; i += 1) samples[i] = 0.5;

  const trimmed = trimSilence(samples, rate);
  // 前後に0.15秒ずつ残して、0.8秒ぶんになる。
  assert.equal(trimmed.length, Math.round(rate * 0.8));
  assert.ok(trimmed.length < samples.length / 5);
});

test('a quiet recording is kept rather than mistaken for silence', () => {
  const rate = 16000;
  const samples = new Float32Array(rate);
  // 小さい声。固定の閾値だと丸ごと消える。
  for (let i = 0; i < rate; i += 1) samples[i] = 0.004;

  assert.equal(trimSilence(samples, rate).length, samples.length);
});

test('an entirely silent recording is left alone', () => {
  const samples = new Float32Array(1000);
  assert.equal(trimSilence(samples, 16000).length, samples.length);
  assert.equal(trimSilence(new Float32Array(0), 16000).length, 0);
});
