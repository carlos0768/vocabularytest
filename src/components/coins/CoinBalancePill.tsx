'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useCoins } from '@/hooks/use-coins';

// ホームヘッダーのストリークチップと同じ視覚文法のコイン残高ピル。
// コイン制オフ / 非Pro のときは何も描画しない。
export function CoinBalancePill() {
  const { isPro } = useAuth();
  const { enabled, balance } = useCoins();

  if (!enabled || !isPro) return null;

  return (
    <Link
      href="/coins"
      className="flex items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] px-2.5 py-1.5 bg-[var(--color-surface)]"
      aria-label={`コイン残高 ${balance.totalRemaining}枚`}
    >
      <Icon name="toll" size={16} className="text-[var(--color-primary)]" />
      <span className="text-sm font-bold font-mono text-[var(--color-foreground)]">
        {balance.totalRemaining}
      </span>
      <span className="text-xs text-[var(--color-muted)]">枚</span>
    </Link>
  );
}
