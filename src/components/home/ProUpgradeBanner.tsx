'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// Pro upgrade funnel entry for free users. Rendered on the logged-in home so
// the paywall (/subscription) is reachable without digging into settings.
export function ProUpgradeBanner() {
  return (
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
  );
}
