import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LINEAR16_SAMPLE_RATE,
  floatsToPcm16,
  mixToMono,
  passthroughEncodingFor,
  resampleMono,
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
