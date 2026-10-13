'use client';

import type { ReactNode } from 'react';
import { useLayoutMode } from '@/hooks/use-layout-mode';

/**
 * tablet レイアウトのときだけ children をマウントする。
 *
 * phone / desktop の 2 本のツリーは CSS で出し分けて常時マウントしているが、
 * タブレット専用ビューまで常時マウントすると描画コストが 3 倍になるので、
 * こちらは JS で判定して必要なときだけ描く。SSR では描かない (サーバーの
 * レイアウトは phone)。ページは元々クライアント描画 + スケルトンなので、
 * ハイドレーションまでの一瞬の空白は許容している。
 */
export function TabletOnly({ children }: { children: ReactNode }) {
  const mode = useLayoutMode();
  return mode === 'tablet' ? <>{children}</> : null;
}
