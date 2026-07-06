import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveScanCoinState } from './scan-cost';

test('deriveScanCoinState hides cost when the coin system is off', () => {
  assert.deepEqual(
    deriveScanCoinState({ enabled: false, isPro: true, modes: ['all'], imageCount: 1, totalRemaining: 300 }),
    { showCost: false, cost: null, insufficient: false },
  );
  // フラグ状態未取得（null）でも表示しない
  assert.deepEqual(
    deriveScanCoinState({ enabled: null, isPro: true, modes: ['all'], imageCount: 1, totalRemaining: 300 }),
    { showCost: false, cost: null, insufficient: false },
  );
});

test('deriveScanCoinState hides cost for non-Pro users', () => {
  assert.deepEqual(
    deriveScanCoinState({ enabled: true, isPro: false, modes: ['all'], imageCount: 1, totalRemaining: 300 }),
    { showCost: false, cost: null, insufficient: false },
  );
});

test('deriveScanCoinState computes cost and sufficiency for Pro + enabled', () => {
  assert.deepEqual(
    deriveScanCoinState({ enabled: true, isPro: true, modes: ['all'], imageCount: 1, totalRemaining: 300 }),
    { showCost: true, cost: 3, insufficient: false },
  );
  // all + idiom = 6、3枚で +2 = 8
  assert.deepEqual(
    deriveScanCoinState({ enabled: true, isPro: true, modes: ['all', 'idiom'], imageCount: 3, totalRemaining: 300 }),
    { showCost: true, cost: 8, insufficient: false },
  );
});

test('deriveScanCoinState flags insufficient balance', () => {
  assert.deepEqual(
    deriveScanCoinState({ enabled: true, isPro: true, modes: ['all'], imageCount: 1, totalRemaining: 2 }),
    { showCost: true, cost: 3, insufficient: true },
  );
  // ちょうど足りる場合は不足でない
  assert.deepEqual(
    deriveScanCoinState({ enabled: true, isPro: true, modes: ['all'], imageCount: 1, totalRemaining: 3 }),
    { showCost: true, cost: 3, insufficient: false },
  );
});

test('deriveScanCoinState treats 0 images as 1 and never throws on empty modes', () => {
  assert.deepEqual(
    deriveScanCoinState({ enabled: true, isPro: true, modes: ['circled'], imageCount: 0, totalRemaining: 300 }),
    { showCost: true, cost: 2, insufficient: false },
  );
  // モード未選択ではブロックしない（showCost:false）
  assert.deepEqual(
    deriveScanCoinState({ enabled: true, isPro: true, modes: [], imageCount: 1, totalRemaining: 300 }),
    { showCost: false, cost: null, insufficient: false },
  );
});
