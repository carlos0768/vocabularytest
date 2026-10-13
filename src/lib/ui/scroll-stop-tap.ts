/**
 * 「慣性スクロールを止めるためのタップ」が click にならないようにする判定。
 *
 * iPad では本文が overflow コンテナ (.ds-live-main) でスクロールする。iOS は
 * overflow 要素の慣性スクロール中に指を置くと、スクロールを止めたうえで
 * その場所に click まで飛ばすので、たまたま指の下にあったリンクが開いてしまう
 * (window がスクロールするスマホでは click は飛ばないので起きない)。
 *
 * 直前までスクロールイベントが来ていた (= まだ動いていた) ところに置かれた
 * 指で、動かさずに離したものを「止めるためのタップ」とみなし、その直後の
 * click を 1 回だけ捨てる。DOM には触らず時刻だけで判定するので、
 * PersistentAppShell のタッチガードから呼び、テストは偽の時計で回す。
 */

/** touchstart の時点で、これより新しいスクロールイベントがあれば「まだスクロール中」 */
export const SCROLL_STOP_TAP_WINDOW_MS = 120;
/** 止めるためのタップのあと、click を捨てる猶予 (iOS は touchend の直後に click を出す) */
export const SCROLL_STOP_CLICK_SUPPRESS_MS = 600;

export type ScrollStopTapGuard = {
  /** スクロールイベントのたびに呼ぶ */
  onScroll: () => void;
  onTouchStart: () => void;
  /** 指が動いた (スクロール操作になった) ら呼ぶ。止めるためのタップではなくなる */
  onTouchMove: () => void;
  /** 指を離した。`moved` は touchstart からしきい値以上動いたか */
  onTouchEnd: (moved: boolean) => void;
  onTouchCancel: () => void;
  /** click を捨てるべきなら true (1 回だけ true を返し、以後は false) */
  shouldSuppressClick: () => boolean;
};

export function createScrollStopTapGuard(now: () => number = () => performance.now()): ScrollStopTapGuard {
  let lastScrollAt = Number.NEGATIVE_INFINITY;
  let touchStartedDuringScroll = false;
  let suppressClickUntil = Number.NEGATIVE_INFINITY;

  return {
    onScroll() {
      lastScrollAt = now();
    },
    onTouchStart() {
      touchStartedDuringScroll = now() - lastScrollAt < SCROLL_STOP_TAP_WINDOW_MS;
    },
    onTouchMove() {
      touchStartedDuringScroll = false;
    },
    onTouchEnd(moved) {
      if (touchStartedDuringScroll && !moved) {
        suppressClickUntil = now() + SCROLL_STOP_CLICK_SUPPRESS_MS;
      }
      touchStartedDuringScroll = false;
    },
    onTouchCancel() {
      touchStartedDuringScroll = false;
    },
    shouldSuppressClick() {
      if (now() < suppressClickUntil) {
        suppressClickUntil = Number.NEGATIVE_INFINITY;
        return true;
      }
      return false;
    },
  };
}
