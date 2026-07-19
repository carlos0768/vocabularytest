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
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return scrolled;
}
