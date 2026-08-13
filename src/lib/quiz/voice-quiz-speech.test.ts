import test from 'node:test';
import assert from 'node:assert/strict';

import { playbackTimeoutMs } from './voice-quiz-speech';

/**
 * 鳴り終わりを待つ上限。`ended` が上がらなかったときに待たされる時間そのもので、
 * ここが長いと1片ごとに沈黙が積み上がり、出題が始まらないように見える。
 */
test('the wait is scaled to the clip, not a flat ceiling', () => {
  // 1.5秒の掛け声なら、遅れを見ても3.25秒あれば足りる。
  assert.equal(playbackTimeoutMs(1.5), 3250);
  assert.equal(playbackTimeoutMs(3), 5500);
});

test('a short clip still gets a moment of slack', () => {
  // 再生の立ち上がりぶん。0.4秒の音声を0.4秒で見切らない。
  assert.ok(playbackTimeoutMs(0.4) >= 1000);
});

test('an unknown duration falls back to the flat ceiling', () => {
  // メタデータが読めていないと duration は NaN になる。
  assert.equal(playbackTimeoutMs(Number.NaN), 12_000);
  assert.equal(playbackTimeoutMs(0), 12_000);
  assert.equal(playbackTimeoutMs(Number.POSITIVE_INFINITY), 12_000);
});

test('an implausibly long clip cannot exceed the ceiling', () => {
  assert.equal(playbackTimeoutMs(600), 12_000);
});
