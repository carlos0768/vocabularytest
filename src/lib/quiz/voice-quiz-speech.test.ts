import test from 'node:test';
import assert from 'node:assert/strict';

import { playbackTimeoutMs } from './voice-quiz-speech';

/**
 * 再生の待ち方そのものは voice-quiz-clips.test.ts で見る。
 * ここでは、読み上げ側から同じ判断が使えることだけ確かめる。
 */
test('the playback budget is shared with the clip player', () => {
  assert.equal(playbackTimeoutMs(1.5), 3250);
  assert.equal(playbackTimeoutMs(Number.NaN), 12_000);
});
