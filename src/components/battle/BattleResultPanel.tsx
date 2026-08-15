'use client';

/**
 * 対戦結果。勝敗はサーバーが決めた winner_user_id から導出済みのものを受け取る。
 */

import { Icon } from '@/components/ui/Icon';
import { BattleScoreboard } from '@/components/battle/BattleScoreboard';
import type { BattleResultForViewer } from '@/lib/battle/room-state';
import type { BattleOutcome, BattleParticipant } from '@/lib/battle/types';

const RESULT_STYLES: Record<
  Exclude<BattleResultForViewer, 'pending'>,
  { icon: string; heading: string; className: string }
> = {
  win: {
    icon: 'emoji_events',
    heading: '勝ち！',
    className: 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white',
  },
  lose: {
    icon: 'sentiment_dissatisfied',
    heading: '負け...',
    className: 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]',
  },
  draw: {
    icon: 'balance',
    heading: '引き分け',
    className: 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]',
  },
};

export function BattleResultPanel({
  result,
  outcome,
  cancelled,
  self,
  opponent,
}: {
  result: BattleResultForViewer;
  outcome: BattleOutcome | null;
  cancelled: boolean;
  self: BattleParticipant;
  opponent: BattleParticipant | null;
}) {
  if (cancelled) {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
          <Icon name="close" size={24} />
        </div>
        <h1 className="font-display text-[22px] font-black tracking-tight">対戦は中止されました</h1>
      </div>
    );
  }

  const style = RESULT_STYLES[result === 'pending' ? 'draw' : result];

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className={`flex w-full flex-col items-center gap-2 rounded-[18px] border-2 px-6 py-7 shadow-[2px_3px_0_var(--solid-ink)] ${style.className}`}
      >
        <Icon name={style.icon} size={34} />
        <h1 className="font-display text-[26px] font-black tracking-tight">{style.heading}</h1>
        {outcome === 'abandoned' && (
          <p className="text-[12px] opacity-90">相手が退出しました</p>
        )}
      </div>

      <div className="w-full">
        <BattleScoreboard self={self} opponent={opponent} />
      </div>
    </div>
  );
}
