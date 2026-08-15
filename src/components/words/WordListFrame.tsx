'use client';

/**
 * 単語一覧の「枠」。
 *
 * カードで囲まず、区切り線だけで行を積む（/words と単語帳詳細で使っている形）。
 * グループの単語一覧もこの枠を使うので、アプリ内で単語の並びの見た目が1つに
 * そろう。
 *
 * `fullBleed` を付けると、ページの左右パディングを打ち消して区切り線を画面の
 * 端まで伸ばす。行側で同じぶんの padding を持つ前提。
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function WordListFrame({
  children,
  fullBleed = false,
  className,
}: {
  children: ReactNode;
  /** 親の px-[14px] を打ち消して横幅いっぱいに広げる。 */
  fullBleed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'divide-y divide-[var(--color-border)]',
        fullBleed && '-mx-[14px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
