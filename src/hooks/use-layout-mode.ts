'use client';

import { useSyncExternalStore } from 'react';
import {
  getLayoutModeSnapshot,
  getServerLayoutModeSnapshot,
  subscribeLayoutMode,
} from '@/lib/ui/layout-mode-store';
import type { LayoutMode, TabletSize } from '@/lib/ui/layout-mode';

/**
 * 今のレイアウトモード (`phone` / `tablet` / `desktop`)。
 * CSS の `desktop:` / `tablet:` バリアントと同じ判定 (`<html data-layout>`) を返す。
 * サーバーでは `phone` (無印ユーティリティ = スマホ基準と同じ)。
 *
 * 「どの UI ツリーを出すか」は CSS バリアントに任せ、ここは挙動 (ツアーを出すか、
 * シートかモーダルか、キーボードショートカットを聞くか) の分岐に使う。
 */
export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(
    subscribeLayoutMode,
    () => getLayoutModeSnapshot().mode,
    () => getServerLayoutModeSnapshot().mode,
  );
}

/** tablet のときだけ `compact` (縦向き) / `regular` (横向き)。それ以外は null */
export function useTabletSize(): TabletSize | null {
  return useSyncExternalStore(
    subscribeLayoutMode,
    () => getLayoutModeSnapshot().tabletSize,
    () => getServerLayoutModeSnapshot().tabletSize,
  );
}
