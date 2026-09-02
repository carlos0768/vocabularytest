import test from 'node:test';
import assert from 'node:assert/strict';

import type { WordStatus } from '@/types';
import {
  WORD_STATUS_CYCLE,
  getNextWordStatus,
  getWordStatusForStep,
  getWordStatusStep,
} from './status-cycle';

test('タップは 未学習 → 学習中 → 定着中 → 習得済み → 未学習 と一巡する', () => {
  assert.equal(getNextWordStatus('new'), 'review');
  assert.equal(getNextWordStatus('review'), 'active');
  assert.equal(getNextWordStatus('active'), 'mastered');
  // 習得済みからは未学習に戻る (以前は定着中へ逆走し、未学習に戻れなくなっていた)。
  assert.equal(getNextWordStatus('mastered'), 'new');
});

test('4回タップするとどの段階から始めても元に戻る', () => {
  for (const start of WORD_STATUS_CYCLE) {
    let status: WordStatus = start;
    const seen: WordStatus[] = [];
    for (let i = 0; i < 4; i++) {
      status = getNextWordStatus(status);
      seen.push(status);
    }
    assert.equal(status, start, `${start} から4回で戻らない`);
    // 一巡の途中で同じ段階を2度通らない (往復していない証拠)。
    assert.equal(new Set(seen).size, 4);
  }
});

test('マスの塗り数と習得度が相互に対応する', () => {
  assert.deepEqual(WORD_STATUS_CYCLE.map(getWordStatusStep), [0, 1, 2, 3]);
  assert.deepEqual([0, 1, 2, 3].map(getWordStatusForStep), [...WORD_STATUS_CYCLE]);
  // 範囲外は未学習に丸める (一巡の折り返しでマイナスや4を渡さない保険)。
  assert.equal(getWordStatusForStep(4), 'new');
  assert.equal(getWordStatusForStep(-1), 'new');
});
