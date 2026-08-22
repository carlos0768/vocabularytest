'use client';

import { useEffect } from 'react';
import { useTheme } from '@/components/theme-provider';

/**
 * Overrides the app-wide `--color-background` CSS variable while the page is
 * mounted. Pages that paint their own tinted background (e.g. the cream
 * onboarding shell) need this so the body and the fixed StatusBarCover —
 * both painted with `var(--color-background)` — match the page instead of
 * showing a white band behind the status bar / notch.
 *
 * 上書きはインラインスタイルなので `.dark` のパレットより強い。ダーク用の色を
 * 渡さないとダークモードでもその明るい色が残り、白い文字が読めなくなる。
 * `darkColor` を省略した場合はダーク時に上書き自体をやめ、テーマ既定の
 * 背景をそのまま使う。
 */
export function usePageBackground(color: string, darkColor?: string) {
  const { resolvedTheme } = useTheme();
  const applied = resolvedTheme === 'dark' ? darkColor : color;

  useEffect(() => {
    if (!applied) return;

    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--color-background');
    root.style.setProperty('--color-background', applied);
    return () => {
      if (previous) {
        root.style.setProperty('--color-background', previous);
      } else {
        root.style.removeProperty('--color-background');
      }
    };
  }, [applied]);
}
