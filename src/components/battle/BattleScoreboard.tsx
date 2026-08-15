'use client';

/**
 * 自分 vs 相手のスコア表示。対戦中は固定ヘッダの中、結果画面では本文の中に
 * 置くので、`size` で詰めた版と大きい版を切り替える。
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { BattleParticipant } from '@/lib/battle/types';

export function BattleScoreboard({
  self,
  opponent,
  size = 'compact',
  leaderUserId = null,
}: {
  self: BattleParticipant;
  opponent: BattleParticipant | null;
  size?: 'compact' | 'large';
  /** 直近のラウンドを取った側。取った瞬間だけ光らせる */
  leaderUserId?: string | null;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <BattleScoreSide
        participant={self}
        label="あなた"
        size={size}
        highlighted={Boolean(leaderUserId) && leaderUserId === self.userId}
      />

      <div className="flex shrink-0 flex-col items-center justify-center">
        <span
          className={cn(
            'font-display font-black leading-none text-[var(--color-muted)]',
            size === 'large' ? 'text-[18px]' : 'text-[13px]',
          )}
        >
          VS
        </span>
      </div>

      <BattleScoreSide
        participant={opponent}
        label="相手"
        size={size}
        highlighted={Boolean(leaderUserId) && Boolean(opponent) && leaderUserId === opponent?.userId}
        align="right"
      />
    </div>
  );
}

function BattleScoreSide({
  participant,
  label,
  size,
  highlighted,
  align = 'left',
}: {
  participant: BattleParticipant | null;
  label: string;
  size: 'compact' | 'large';
  highlighted: boolean;
  align?: 'left' | 'right';
}) {
  const large = size === 'large';
  const name = participant?.displayName ?? '待機中';

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border-2 bg-[var(--color-surface)] transition-colors duration-150',
        large ? 'p-3.5' : 'px-2.5 py-2',
        align === 'right' && 'flex-row-reverse',
        highlighted ? 'border-[var(--color-accent)]' : 'border-[var(--solid-ink)]',
      )}
    >
      <BattleAvatar participant={participant} size={large ? 44 : 30} />

      <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
        <p className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          {label}
        </p>
        <p
          className={cn(
            'truncate font-display font-bold text-[var(--solid-ink)]',
            large ? 'text-[14px]' : 'text-[11.5px]',
          )}
        >
          {name}
        </p>
      </div>

      <span
        className={cn(
          'shrink-0 font-display font-black leading-none tabular-nums',
          large ? 'text-[34px]' : 'text-[22px]',
          highlighted ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]',
        )}
      >
        {participant?.score ?? 0}
      </span>
    </div>
  );
}

function BattleAvatar({ participant, size }: { participant: BattleParticipant | null; size: number }) {
  const initial = participant?.displayName?.trim().charAt(0) ?? '';

  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] font-display font-black text-[var(--solid-ink)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {participant?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 外部のアバターURLをそのまま出す（他画面と同じ扱い）
        <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : initial ? (
        initial
      ) : (
        <Icon name="person" size={Math.round(size * 0.5)} className="text-[var(--color-muted)]" />
      )}
    </span>
  );
}
