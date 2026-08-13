import test from 'node:test';
import assert from 'node:assert/strict';

import { elementFailureReason, isRetriableClipFailure, playbackTimeoutMs } from './voice-quiz-clips';

/**
 * 鳴り終わりを待つ上限。終わりの通知が来なかったときに待たされる時間そのもので、
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

/**
 * 失敗した音声を諦めるかどうか。
 *
 * 何であれ一度で諦める作りだったせいで、自動再生に弾かれた1問目のあと
 * セッション中ずっと合成音声で読まれていた。通信や再生の失敗は次でまた試す。
 */
test('a transient failure does not disable the clip for the session', () => {
  assert.equal(isRetriableClipFailure('network'), true);
  assert.equal(isRetriableClipFailure('playback'), true);
});

test('a clip the server does not have, or cannot be decoded, is given up on', () => {
  assert.equal(isRetriableClipFailure('http'), false);
  assert.equal(isRetriableClipFailure('decode'), false);
});

/**
 * 次の一片へ進むために <audio> の src を差し替えると、前の再生は中断エラーになる。
 * これを「使えない音声」と覚えてしまうと、鳴っていた音声まで合成音声に落ちる。
 */
test('an aborted or networked-out element playback is retried', () => {
  assert.equal(isRetriableClipFailure(elementFailureReason(1)), true); // ABORTED
  assert.equal(isRetriableClipFailure(elementFailureReason(2)), true); // NETWORK
  assert.equal(isRetriableClipFailure(elementFailureReason(undefined)), true);
});

test('an element that cannot decode or does not have the source is given up on', () => {
  assert.equal(isRetriableClipFailure(elementFailureReason(3)), false); // DECODE
  assert.equal(isRetriableClipFailure(elementFailureReason(4)), false); // SRC_NOT_SUPPORTED
});
