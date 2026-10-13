'use client';

import { useLayoutMode } from '@/hooks/use-layout-mode';

/**
 * レイアウトモードの購読者を常に 1 つ持たせる。購読者がいる間だけストアが
 * リサイズ・回転を聞いて `<html data-layout>` を更新するので、ページ側に
 * `useLayoutMode()` を使う部品が無くても CSS バリアントが追従する。
 */
export function LayoutModeSync() {
  useLayoutMode();
  return null;
}
