'use client';

import { useCallback, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const DISMISS_STORAGE_KEY = 'merken:home-upgrade-banner-dismissed';

// Dismissal is per-device (localStorage), shared by the mobile and desktop
// home banners via a tiny external store. The cache keeps the snapshot
// stable and lets dismiss() re-render subscribers in the same tab (the
// storage event only fires in other tabs).
let dismissedCache: boolean | null = null;
const dismissListeners = new Set<() => void>();

function readDismissed(): boolean {
  if (dismissedCache === null) {
    try {
      dismissedCache = window.localStorage.getItem(DISMISS_STORAGE_KEY) === '1';
    } catch {
      dismissedCache = false;
    }
  }
  return dismissedCache;
}

function subscribeDismissed(listener: () => void): () => void {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}

export function useProUpgradeBannerDismissed(): [boolean, () => void] {
  // Server snapshot is "dismissed" so SSR/hydration never flashes the banner.
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => true);

  const dismiss = useCallback(() => {
    dismissedCache = true;
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      // Private mode etc: hide for this session only.
    }
    dismissListeners.forEach((listener) => listener());
  }, []);

  return [dismissed, dismiss];
}

// Pro upgrade funnel entry for free users. Rendered on the logged-in home so
// the paywall (/subscription) is reachable without digging into settings.
export function ProUpgradeBanner({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div className="relative">
      <Link
        href="/subscription"
        className="flex items-center gap-2.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-gradient-to-br from-[oklch(0.94_0.06_130)] to-white p-[12px_14px]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white">
          <Icon name="auto_awesome" size={17} filled />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-accent)]">UPGRADE</span>
            <span className="h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
            <span className="font-mono text-[9px] text-[var(--color-muted)]">月額プラン</span>
          </div>
          <div className="mt-[3px] font-display text-sm font-bold text-[var(--solid-ink)]">Pro でぜんぶ使う</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">写真スキャンで単語帳を自動作成・単語帳 無制限</div>
        </div>
        <div className="rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-[14px] py-2 font-display text-xs font-bold text-white shadow-[2px_2px_0_var(--color-accent)]">見る</div>
      </Link>
      {onDismiss && (
        <button
          type="button"
          aria-label="アップグレード案内を閉じる"
          onClick={onDismiss}
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}
