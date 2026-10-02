'use client';

import { useEffect, useState } from 'react';

/** これより上にいるうちはヘッダを常に出す(ページ最上部付近)。 */
const TOP_ZONE_PX = 56;
/** これ未満の動きは無視する(慣性スクロール終わりの細かい揺れで出入りさせない)。 */
const JITTER_PX = 6;

/**
 * 下へスクロールしたら隠し、上へスクロールしたら出す、の判定。
 * iOS のバウンスで scrollY が負になるときも「最上部」として出す。
 */
export function nextHeaderHidden(hidden: boolean, previousY: number, y: number): boolean {
  if (y <= TOP_ZONE_PX) return false;
  const delta = y - previousY;
  if (Math.abs(delta) < JITTER_PX) return hidden;
  return delta > 0;
}

/**
 * ホームのヘッダを「下スクロールで格納・上スクロールで再表示」にするためのフック。
 * モバイルは window がスクロールするので window.scrollY だけを見る。
 */
export function useHideOnScroll(): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let previousY = window.scrollY;
    let current = false;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        const next = nextHeaderHidden(current, previousY, y);
        // 揺れとして無視したときは基準位置を動かさない。ゆっくり動かしても
        // 少しずつ溜まって、いずれ向きが判定されるようにする。
        if (next !== current || Math.abs(y - previousY) >= JITTER_PX || y <= TOP_ZONE_PX) {
          previousY = y;
        }
        if (next !== current) {
          current = next;
          setHidden(next);
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return hidden;
}
