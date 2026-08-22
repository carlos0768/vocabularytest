'use client';

/** 決着画面。勝敗ヒーロー + 最終スコア + 次のアクション。 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { BattleParticipant } from '@/lib/battle/types';
import type { BattleResultForViewer } from '@/lib/battle/room-state';

type ResultTheme = {
  eyebrow: string;
  title: string;
  icon: string;
  bg: string;
  border: string;
  color: string;
};

const RESULT_THEME: Record<Exclude<BattleResultForViewer, 'pending'>, ResultTheme> = {
  win: {
    eyebrow: 'YOU WIN',
    title: '勝ち！',
    icon: 'emoji_events',
    bg: 'var(--color-accent)',
    border: 'var(--color-accent-ink)',
    color: 'var(--color-on-ink)',
  },
  lose: {
    eyebrow: 'YOU LOSE',
    title: '負け...',
    icon: 'sentiment_dissatisfied',
    bg: 'var(--color-surface)',
    border: 'var(--solid-ink)',
    color: 'var(--solid-ink)',
  },
  draw: {
    eyebrow: 'DRAW',
    title: '引き分け',
    icon: 'balance',
    bg: 'var(--color-surface)',
    border: 'var(--solid-ink)',
    color: 'var(--solid-ink)',
  },
};

const CANCELLED_THEME: ResultTheme = {
  eyebrow: 'CANCELLED',
  title: '対戦は中止されました',
  icon: 'block',
  bg: 'var(--color-surface)',
  border: 'var(--solid-ink)',
  color: 'var(--solid-ink)',
};

function FinalScore({
  participant,
  label,
  score,
  highlight,
}: {
  participant: BattleParticipant | null;
  label: string;
  score: number;
  highlight: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <ProfileAvatar
        avatarUrl={participant?.avatarUrl}
        initial={(participant?.displayName?.trim().charAt(0) || '?').toUpperCase()}
        color={profileAvatarColor(participant?.userId ?? label)}
        size={44}
        radius={22}
      />
      <div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="w-full truncate text-center text-[12.5px] font-bold text-[var(--solid-ink)]">
        {participant?.displayName ?? '不在'}
      </div>
      <div
        className={`font-display text-[30px] font-black leading-none tabular-nums ${
          highlight ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'
        }`}
      >
        {score}
      </div>
    </div>
  );
}

export function BattleResultPanel({
  result,
  cancelled,
  abandoned,
  self,
  opponent,
  onRematch,
  rematchPending,
  rematchError,
  backHref,
  backLabel = '対戦トップに戻る',
}: {
  result: BattleResultForViewer;
  cancelled: boolean;
  abandoned: boolean;
  self: BattleParticipant;
  opponent: BattleParticipant | null;
  /** 押すと同じ相手との次の対戦部屋へ移る。ロビーへは戻さない。 */
  onRematch: () => void;
  rematchPending: boolean;
  rematchError: string | null;
  /** 「戻る」の行き先。対戦の入り口（ロビー / グループ対戦）。 */
  backHref: string;
  backLabel?: string;
}) {
  const theme = cancelled || result === 'pending' ? CANCELLED_THEME : RESULT_THEME[result];
  const selfScore = self.score ?? 0;
  const opponentScore = opponent?.score ?? 0;

  return (
    <div className="w-full">
      <div
        className="flex flex-col items-center rounded-[18px] border-2 px-5 py-7 text-center shadow-[3px_4px_0_var(--solid-ink)]"
        style={{ background: theme.bg, borderColor: theme.border, color: theme.color }}
      >
        <Icon name={theme.icon} size={38} />
        <div className="mt-2 font-mono text-[10px] font-bold tracking-[0.12em] opacity-80">
          {theme.eyebrow}
        </div>
        <h1 className="mt-1 font-display text-[28px] font-black leading-tight">{theme.title}</h1>
        {abandoned && (
          <p className="mt-2 text-[12.5px] font-bold opacity-85">相手が退出しました。</p>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-5">
        <FinalScore
          participant={self}
          label="YOU"
          score={selfScore}
          highlight={selfScore > opponentScore}
        />
        {/* 「VS」はアバターの高さに合わせて置く（スコア行は左右で高さが変わるため） */}
        <span className="mt-3 shrink-0 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] px-2 py-0.5 font-mono text-[10px] font-black text-[var(--solid-ink)]">
          VS
        </span>
        <FinalScore
          participant={opponent}
          label="RIVAL"
          score={opponentScore}
          highlight={opponentScore > selfScore}
        />
      </div>

      <button
        type="button"
        onClick={onRematch}
        disabled={rematchPending}
        className="mt-5 flex h-[52px] w-full items-center justify-center gap-1.5 rounded-[14px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[15px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-60"
      >
        <Icon
          name={rematchPending ? 'progress_activity' : 'swords'}
          size={18}
          className={rematchPending ? 'animate-spin' : undefined}
        />
        {rematchPending ? '準備しています...' : 'もう一度対戦する'}
      </button>
      {rematchError && (
        <p className="mt-2 text-center text-[12.5px] font-bold text-[var(--color-error)]">
          {rematchError}
        </p>
      )}
      <p className="mt-2 text-center text-[11.5px] leading-[1.6] text-[var(--color-muted)]">
        同じ相手・同じ設定でそのまま続けます。
        <br />
        相手が押すと自動で始まります。
      </p>
      <Link
        href={backHref}
        className="mt-2.5 flex h-12 items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[14px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
      >
        {backLabel}
      </Link>
    </div>
  );
}
