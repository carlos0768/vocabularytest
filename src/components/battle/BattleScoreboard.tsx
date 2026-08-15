'use client';

/**
 * 対戦中・結果画面のスコア表示。
 * 自分は常に左、相手は常に右に固定して、どちらの視点でも読み方が変わらないようにする。
 */

import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { BattleParticipant } from '@/lib/battle/types';

function initialOf(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

function PlayerColumn({
  participant,
  label,
  leading,
  justScored,
}: {
  participant: BattleParticipant | null;
  label: string;
  leading: boolean;
  justScored: boolean;
}) {
  const name = participant?.displayName ?? '待機中';

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <ProfileAvatar
        avatarUrl={participant?.avatarUrl}
        initial={initialOf(name)}
        color={profileAvatarColor(participant?.userId ?? name)}
        size={44}
        radius={22}
        className={justScored ? 'animate-pulse' : undefined}
      />
      <p className="max-w-full truncate font-display text-[12px] font-bold text-[var(--solid-ink)]">
        {name}
      </p>
      <p className="font-mono text-[8.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </p>
      <p
        className={`font-display text-[30px] font-black leading-none tabular-nums transition-colors ${
          leading ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'
        }`}
      >
        {participant?.score ?? 0}
      </p>
    </div>
  );
}

export function BattleScoreboard({
  self,
  opponent,
  /** 直前のラウンドで得点した側。アバターを一瞬強調する。 */
  scoredSeat = null,
}: {
  self: BattleParticipant;
  opponent: BattleParticipant | null;
  scoredSeat?: 'self' | 'opponent' | null;
}) {
  const selfScore = self.score;
  const opponentScore = opponent?.score ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-3.5 shadow-[2px_3px_0_var(--solid-ink)]">
      <PlayerColumn
        participant={self}
        label="YOU"
        leading={selfScore > opponentScore}
        justScored={scoredSeat === 'self'}
      />

      <div className="shrink-0 font-display text-[13px] font-black tracking-[0.08em] text-[var(--color-muted)]">
        VS
      </div>

      <PlayerColumn
        participant={opponent}
        label="RIVAL"
        leading={opponentScore > selfScore}
        justScored={scoredSeat === 'opponent'}
      />
    </div>
  );
}
