'use client';

/**
 * ホームのリアルタイム単語対戦への導線（参加中のグループの上に配置）。
 * 対戦はPro限定なので、Freeユーザーには何も表示しない。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export function BattleEntrySection({ isPro }: { isPro: boolean }) {
  if (!isPro) return null;

  return (
    <div className="pb-1 pt-3">
      <div className="mb-2.5 flex items-center gap-2 px-[18px]">
        <Icon name="swords" size={20} className="text-[var(--solid-ink)]" />
        <h2 className="font-display text-[18px] font-black tracking-tight text-[var(--solid-ink)]">単語対戦</h2>
      </div>

      <div className="px-[18px]">
        <Link
          href="/battle"
          className="relative flex items-center gap-3 overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] p-4 text-white shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]"
        >
          <div className="absolute inset-y-0 left-0 w-[6px] bg-[rgba(0,0,0,0.22)]" />
          <Icon name="bolt" size={28} className="ml-1 shrink-0 drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-bold leading-snug drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
              リアルタイム対戦
            </p>
            <p className="mt-0.5 font-mono text-[9.5px] font-bold tracking-[0.04em] opacity-90">
              早押し4択 / フレンド・ランダム
            </p>
          </div>
          <Icon name="chevron_right" size={18} className="shrink-0" />
        </Link>
      </div>
    </div>
  );
}
