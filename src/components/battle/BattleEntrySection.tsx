'use client';

/**
 * リアルタイム単語対戦への導線（共有ページのカテゴリタイルの下に配置）。
 *
 * 対戦はFreeでも1日 `FREE_DAILY_BATTLE_LIMIT` 回まで遊べるので、Freeにも出す。
 * ここでは残数をサーバーに問い合わせない —— 共有ページの初回表示にリクエストを
 * 1本足したくないため。正確な残数はロビー（/battle）が出す。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { FREE_DAILY_BATTLE_LIMIT } from '@/lib/battle/free-allowance';

export function BattleEntrySection({ isPro }: { isPro: boolean }) {
  return (
    <Link
      href="/battle"
      className="relative flex items-center gap-3 overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] p-4 text-[var(--color-on-accent)] shadow-[2px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-shadow)]"
        >
      <div className="absolute inset-y-0 left-0 w-[6px] bg-[rgba(0,0,0,0.22)]" />
      <Icon name="bolt" size={28} className="ml-1 shrink-0 drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold leading-snug drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
          リアルタイム対戦
        </p>
        <p className="mt-0.5 font-mono text-[9.5px] font-bold tracking-[0.04em] opacity-90">
          {isPro
            ? '早押し4択 / フレンド・ランダム'
            : `早押し4択 / 無料プランは1日${FREE_DAILY_BATTLE_LIMIT}回まで`}
        </p>
      </div>
      <Icon name="chevron_right" size={18} className="shrink-0" />
    </Link>
  );
}
