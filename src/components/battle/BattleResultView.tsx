'use client';

/**
 * 決着画面。勝敗ヒーロー + 最終スコア + 次の導線。
 * 中止 (相手の退出・部屋のキャンセル) もここで扱う。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { BattleScoreboard } from '@/components/battle/BattleScoreboard';
import { cn } from '@/lib/utils';
import type { BattleResultForViewer } from '@/lib/battle/room-state';
import type { BattleParticipant } from '@/lib/battle/types';

const RESULT_HERO: Record<
  BattleResultForViewer | 'cancelled',
  { icon: string; title: string; caption: string; tone: 'win' | 'lose' | 'draw' }
> = {
  win: { icon: 'trophy', title: '勝ち！', caption: 'ナイス早押し。', tone: 'win' },
  lose: { icon: 'sentiment_dissatisfied', title: '負け...', caption: '次は取り返そう。', tone: 'lose' },
  draw: { icon: 'handshake', title: '引き分け', caption: '実力は互角。', tone: 'draw' },
  pending: { icon: 'hourglass_empty', title: '対戦終了', caption: 'おつかれさま。', tone: 'draw' },
  cancelled: { icon: 'block', title: '対戦は中止されました', caption: '', tone: 'draw' },
};

export function BattleResultView({
  result,
  cancelled,
  abandoned,
  self,
  opponent,
}: {
  result: BattleResultForViewer;
  cancelled: boolean;
  /** 相手が退出して終わった対戦 */
  abandoned: boolean;
  self: BattleParticipant;
  opponent: BattleParticipant | null;
}) {
  const hero = RESULT_HERO[cancelled ? 'cancelled' : result];

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          'flex flex-col items-center rounded-[18px] border-2 border-[var(--solid-ink)] px-5 py-8 text-center shadow-[2px_3px_0_var(--solid-ink)]',
          hero.tone === 'win' && 'bg-[var(--color-accent)] text-white',
          hero.tone === 'lose' && 'bg-[var(--solid-ink)] text-[var(--color-surface)]',
          hero.tone === 'draw' && 'bg-[var(--color-surface)] text-[var(--solid-ink)]',
        )}
      >
        <Icon name={hero.icon} size={44} filled={hero.tone === 'win'} />
        <h1 className="mt-3 font-display text-[30px] font-black leading-none">{hero.title}</h1>
        {hero.caption && <p className="mt-2 text-[13px] font-bold opacity-85">{hero.caption}</p>}
        {abandoned && <p className="mt-2 text-[12.5px] font-bold opacity-85">相手が退出しました。</p>}
      </div>

      <BattleScoreboard self={self} opponent={opponent} size="large" />

      <div className="flex flex-col gap-2.5">
        <Link
          href="/battle"
          className="flex h-[52px] items-center justify-center gap-1.5 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[15px] font-bold text-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]"
        >
          <Icon name="swords" size={18} />
          もう一度対戦する
        </Link>
        <Link
          href="/"
          className="flex h-[46px] items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[14px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
