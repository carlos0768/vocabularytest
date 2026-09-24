'use client';

import { useEffect, useState } from 'react';

/**
 * ページが上端からスクロールされているかを返す。
 * 固定ヘッダの下線をページ上端では消し、コンテンツがヘッダの下に
 * 潜り込んだときだけ表示するために使う。
 */
export function usePageScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // モバイルは window がスクロールする。デスクトップはシェルの本文
    // (.ds-live-main) がスクロールするので、そちらの scrollTop も見る。
    // 絞り込みパネルなど内側のスクロールは無視する。
    const readScrollTop = (target: EventTarget | null): number | null => {
      if (target === document || target === window || target == null) return window.scrollY;
      if (target instanceof Element && target.classList.contains('ds-live-main')) return target.scrollTop;
      return null;
    };
    const onScroll = (event?: Event) => {
      const top = readScrollTop(event?.target ?? null);
      if (top === null) return;
      setScrolled(top > threshold);
    };
    onScroll();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, [threshold]);

  return scrolled;
}
