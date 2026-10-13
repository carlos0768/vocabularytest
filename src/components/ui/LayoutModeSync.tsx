'use client';

import { useEffect } from 'react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { reapplyLayoutModeToDocument } from '@/lib/ui/layout-mode-store';

/**
 * レイアウトモードの購読者を常に 1 つ持たせる。購読者がいる間だけストアが
 * リサイズ・回転を聞いて `<html data-layout>` を更新するので、ページ側に
 * `useLayoutMode()` を使う部品が無くても CSS バリアントが追従する。
 *
 * マウント後にもう一度属性を書き直すのは、ハイドレーション不一致で React が
 * ツリーを作り直したときに <head> のブートストラップが書いた属性が消え、
 * タブレットがスマホ表示に落ちたままになるのを防ぐため。
 */
export function LayoutModeSync() {
  const mode = useLayoutMode();
  useEffect(() => {
    reapplyLayoutModeToDocument();
  }, [mode]);
  return null;
}
