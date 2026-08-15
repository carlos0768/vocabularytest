'use client';

/**
 * 対戦部屋に入ったあとの待機画面。
 * - 相手がまだ来ていない: 招待コードを出して待つ
 * - 相手が揃った: ホストが問題を作っている数秒間
 */

import { Icon } from '@/components/ui/Icon';
import { BattlePulse } from '@/components/battle/BattlePulse';
import { BattleScoreboard } from '@/components/battle/BattleScoreboard';
import type { BattleParticipant } from '@/lib/battle/types';

export function BattleWaitingView({
  self,
  opponent,
  inviteCode,
  error,
  onLeave,
}: {
  self: BattleParticipant;
  opponent: BattleParticipant | null;
  inviteCode: string | null;
  error: string | null;
  onLeave: () => void;
}) {
  const waitingForOpponent = !opponent;

  return (
    <div className="flex flex-col items-center gap-6">
      <BattleScoreboard self={self} opponent={opponent} size="large" />

      <div className="w-full rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-6 text-center shadow-[2px_3px_0_var(--solid-ink)]">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
          <Icon
            name={waitingForOpponent ? 'person_search' : 'auto_awesome'}
            size={22}
            className="text-[var(--solid-ink)]"
          />
        </span>
        <h2 className="font-display text-[17px] font-black text-[var(--solid-ink)]">
          {waitingForOpponent ? '相手を待っています' : '問題を準備しています'}
        </h2>
        <p className="mt-2 text-[12.5px] leading-[1.8] text-[var(--color-muted)]">
          {waitingForOpponent
            ? '相手が入室すると自動で始まります。'
            : 'お互いの単語帳から出題を作っています。'}
        </p>

        {inviteCode && waitingForOpponent && (
          <div className="mt-5 rounded-[12px] border-2 border-dashed border-[var(--solid-ink)] px-4 py-3">
            <p className="font-mono text-[9.5px] font-bold tracking-[0.1em] text-[var(--color-muted)]">
              INVITE CODE
            </p>
            <p className="mt-1 font-mono text-[28px] font-black leading-none tracking-[0.16em] text-[var(--solid-ink)]">
              {inviteCode}
            </p>
          </div>
        )}
      </div>

      <BattlePulse label={waitingForOpponent ? '待機中' : 'まもなく開始'} />

      {error && (
        <p className="w-full rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] p-3 text-center text-[12.5px] font-bold text-[var(--color-error)]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onLeave}
        className="text-[13px] font-bold text-[var(--color-muted)] underline underline-offset-4"
      >
        退出する
      </button>
    </div>
  );
}
