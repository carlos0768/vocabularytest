'use client';

import { useEffect, useRef, useState } from 'react';

/** 追加読み込みの進行状態。error のときは自動読み込みを止めて手動再試行を待つ。 */
export type LoadMoreState = 'idle' | 'loading' | 'error';

type UseInfiniteScrollSentinelOptions = {
  /** 続きがあり、かつ読み込み中・エラーでないときだけ true にする。 */
  enabled: boolean;
  /** センチネルが画面に入ったら呼ばれる。多重呼び出しガードは呼び出し側で持つ。 */
  onLoadMore: () => void;
  /** 下端に到達する少し手前から先読みを始めるための余白。 */
  rootMargin?: string;
};

/**
 * 一覧末尾に置いたセンチネル要素が表示領域に入ったら onLoadMore を呼ぶ。
 * 返り値の ref コールバックをセンチネル要素に渡す。display:none の要素は
 * 交差しないため、CSS で出し分けている複製ビュー側のセンチネルは発火しない。
 */
export function useInfiniteScrollSentinel({
  enabled,
  onLoadMore,
  rootMargin = '240px',
}: UseInfiniteScrollSentinelOptions) {
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    if (!enabled || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, sentinel, rootMargin]);

  return setSentinel;
}
