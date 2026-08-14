'use client';

/**
 * 対戦中の固定ヘッダに載せるスコアボードとラウンドタイマー。
 * 早押しなので「どちらがリードしているか」「残り何秒か」を最優先で見せる。
 */

import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { BattleParticipant } from '@/lib/battle/types';

function participantInitial(participant: BattleParticipant | null): string {
  return (participant?.displayName?.trim().charAt(0) || '?').toUpperCase();
}

function PlayerBlock({
  participant,
  label,
  align,
  leading,
}: {
  participant: BattleParticipant | null;
  label: string;
  align: 'left' | 'right';
  leading: boolean;
}) {
  const avatar = (
    <div className="relative shrink-0">
      <ProfileAvatar
        avatarUrl={participant?.avatarUrl}
        initial={participantInitial(participant)}
        color={profileAvatarColor(participant?.userId ?? label)}
        size={34}
        radius={17}
      />
      {leading && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex h-[14px] w-[14px] items-center justify-center rounded-full border-[1.5px] border-[var(--color-background)] bg-[var(--color-accent)]"
          aria-hidden
        />
      )}
    </div>
  );

  const text = (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="truncate font-display text-[13px] font-extrabold leading-tight text-[var(--solid-ink)]">
        {participant?.displayName ?? '待機中'}
      </div>
    </div>
  );

  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {avatar}
      {text}
    </div>
  );
}

export function BattleScoreboard({
  self,
  opponent,
  progressLabel,
  timer,
}: {
  self: BattleParticipant;
  opponent: BattleParticipant | null;
  /** 「3 / 10」形式のラウンド表示。 */
  progressLabel: string;
  /** 対戦中のみ渡す。省略するとタイマー帯を出さない（待機・結果画面）。 */
  timer?: { remainingMs: number; durationMs: number; paused: boolean };
}) {
  const selfScore = self.score ?? 0;
  const opponentScore = opponent?.score ?? 0;
  const secondsLeft = timer ? Math.ceil(timer.remainingMs / 1000) : 0;
  const urgent = Boolean(timer) && !timer!.paused && timer!.remainingMs <= 3000;
  const ratio = timer && timer.durationMs > 0
    ? Math.max(0, Math.min(1, timer.remainingMs / timer.durationMs))
    : 0;

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <PlayerBlock
          participant={self}
          label="YOU"
          align="left"
          leading={selfScore > opponentScore}
        />

        <div className="shrink-0 px-1 text-center">
          <div className="font-display text-[24px] font-black leading-none tabular-nums text-[var(--solid-ink)]">
            {selfScore}
            <span className="mx-1.5 text-[var(--color-muted)]">-</span>
            {opponentScore}
          </div>
          <div className="mt-1 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
            {progressLabel}
          </div>
        </div>

        <PlayerBlock
          participant={opponent}
          label="RIVAL"
          align="right"
          leading={opponentScore > selfScore}
        />
      </div>

      {timer && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
            <div
              className="h-full rounded-full transition-[width] duration-100 ease-linear"
              style={{
                width: `${ratio * 100}%`,
                background: urgent ? 'var(--color-error)' : 'var(--color-accent)',
              }}
            />
          </div>
          <span
            className={`w-[42px] shrink-0 text-right font-mono text-[11px] font-bold tabular-nums ${
              urgent ? 'text-[var(--color-error)]' : 'text-[var(--color-muted)]'
            }`}
          >
            {timer.paused ? '--' : `${secondsLeft}秒`}
          </span>
        </div>
      )}
    </div>
  );
}
