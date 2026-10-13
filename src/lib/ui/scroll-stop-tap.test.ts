import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  SCROLL_STOP_CLICK_SUPPRESS_MS,
  SCROLL_STOP_TAP_WINDOW_MS,
  createScrollStopTapGuard,
} from './scroll-stop-tap';

function setup() {
  let t = 1000;
  const guard = createScrollStopTapGuard(() => t);
  return { guard, advance: (ms: number) => { t += ms; } };
}

describe('createScrollStopTapGuard', () => {
  it('慣性スクロール中に置いて動かさず離した指の直後の click は捨てる', () => {
    const { guard, advance } = setup();
    guard.onScroll();
    advance(16);
    guard.onScroll();
    advance(40); // まだスクロール中 (120ms 以内)
    guard.onTouchStart();
    advance(80);
    guard.onTouchEnd(false);
    advance(20); // iOS は touchend の直後に click
    assert.equal(guard.shouldSuppressClick(), true);
    // 捨てるのは 1 回だけ
    assert.equal(guard.shouldSuppressClick(), false);
  });

  it('スクロールが止まってから置いた指は普通のタップ (click を通す)', () => {
    const { guard, advance } = setup();
    guard.onScroll();
    advance(SCROLL_STOP_TAP_WINDOW_MS + 50);
    guard.onTouchStart();
    advance(60);
    guard.onTouchEnd(false);
    advance(10);
    assert.equal(guard.shouldSuppressClick(), false);
  });

  it('スクロールしていないときのタップは通す', () => {
    const { guard, advance } = setup();
    guard.onTouchStart();
    advance(60);
    guard.onTouchEnd(false);
    assert.equal(guard.shouldSuppressClick(), false);
  });

  it('スクロール中に置いた指でも、動かしたら (スクロール操作) 捨てない', () => {
    const { guard, advance } = setup();
    guard.onScroll();
    advance(30);
    guard.onTouchStart();
    advance(50);
    guard.onTouchMove();
    advance(200);
    guard.onTouchEnd(true);
    assert.equal(guard.shouldSuppressClick(), false);
  });

  it('猶予を過ぎた click は捨てない', () => {
    const { guard, advance } = setup();
    guard.onScroll();
    advance(30);
    guard.onTouchStart();
    advance(50);
    guard.onTouchEnd(false);
    advance(SCROLL_STOP_CLICK_SUPPRESS_MS + 1);
    assert.equal(guard.shouldSuppressClick(), false);
  });

  it('touchcancel で判定を畳む', () => {
    const { guard, advance } = setup();
    guard.onScroll();
    advance(30);
    guard.onTouchStart();
    guard.onTouchCancel();
    guard.onTouchEnd(false);
    assert.equal(guard.shouldSuppressClick(), false);
  });
});
