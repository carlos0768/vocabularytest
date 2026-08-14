/**
 * 「描画が終わったあと」に走らせたい後始末を、ページが隠れていても必ず実行する。
 *
 * requestAnimationFrame は画面消灯・バックグラウンド中は発火しない。
 * rAF だけでアニメーションの後始末 (isAnimating の解除など) をしていると、
 * 画面を消した瞬間にフラグが立ちっぱなしになり、次の操作が弾かれて
 * 自動再生などのループがそこで止まってしまう。
 * rAF とタイマーの早い方で1回だけ実行することで、隠れている間も進む。
 */
export function afterPaint(run: () => void, fallbackMs = 80): () => void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    run();
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(once));
  }
  const timer = setTimeout(once, fallbackMs);

  // 呼び出し側が破棄したいときに使うキャンセル関数。
  return () => {
    done = true;
    clearTimeout(timer);
  };
}

/** ページが隠れている (画面消灯・バックグラウンド) か。 */
export function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}
