import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import { afterPaint, isPageHidden } from './after-paint';

// テストから rAF / document を差し替えるので、型は緩めて扱う。
const globalWithPaint = globalThis as Record<string, unknown>;

function setRaf(impl: ((callback: () => void) => number) | null) {
  if (impl) globalWithPaint.requestAnimationFrame = impl;
  else delete globalWithPaint.requestAnimationFrame;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  setRaf(null);
  delete globalWithPaint.document;
});

describe('afterPaint', () => {
  it('rAF が発火しない (画面消灯中) でもタイマー側で必ず実行する', async () => {
    // 隠れているページの rAF はコールバックを呼ばないまま握りつぶされる
    setRaf(() => 0);

    let ran = 0;
    afterPaint(() => { ran += 1; }, 10);

    assert.equal(ran, 0);
    await wait(40);
    assert.equal(ran, 1);
  });

  it('rAF が発火する場合は1回だけ実行し、タイマーで二重実行しない', async () => {
    setRaf((callback) => {
      setTimeout(callback, 0);
      return 0;
    });

    let ran = 0;
    afterPaint(() => { ran += 1; }, 10);

    await wait(40);
    assert.equal(ran, 1);
  });

  it('rAF が無い環境でもタイマーだけで実行する', async () => {
    let ran = 0;
    afterPaint(() => { ran += 1; }, 10);
    await wait(40);
    assert.equal(ran, 1);
  });

  it('キャンセルすると実行されない', async () => {
    setRaf((callback) => {
      setTimeout(callback, 0);
      return 0;
    });

    let ran = 0;
    const cancel = afterPaint(() => { ran += 1; }, 10);
    cancel();

    await wait(40);
    assert.equal(ran, 0);
  });
});

describe('isPageHidden', () => {
  it('document が無い環境では false', () => {
    assert.equal(isPageHidden(), false);
  });

  it('visibilityState を見る', () => {
    globalWithPaint.document = { visibilityState: 'hidden' };
    assert.equal(isPageHidden(), true);
    globalWithPaint.document = { visibilityState: 'visible' };
    assert.equal(isPageHidden(), false);
  });
});
