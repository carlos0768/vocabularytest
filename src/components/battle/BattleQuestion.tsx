'use client';

/**
 * 出題カード・選択肢ボタン・ラウンド結果の帯。
 * 出題は「英単語 → 日本語の意味を4択」。早押しなので、押せる状態かどうかが
 * ひと目で分かること、押しやすいこと（2×2のボタン盤）を優先している。
 */

import { Icon } from '@/components/ui/Icon';
import { speakEnglish } from '@/lib/speech';
import { triggerHaptic } from '@/lib/haptics';

export type BattleChoiceState =
  /** 押せる */
  | 'idle'
  /** 自分が選んだ（判定待ち） */
  | 'selected'
  /** 回答権を失っている（回答済み・時間切れ） */
  | 'locked'
  /** 開示後：正解 */
  | 'correct'
  /** 開示後：自分が選んだ誤答 */
  | 'wrong'
  /** 開示後：それ以外 */
  | 'muted';

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

export function BattleQuestionCard({ prompt, round }: { prompt: string; round: number }) {
  return (
    <div className="w-full rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-6 text-center shadow-[3px_4px_0_var(--solid-ink)]">
      <div className="font-mono text-[9.5px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
        Q{round} · この単語の意味は？
      </div>
      <h1 className="mt-2 break-words font-display text-[32px] font-black leading-[1.15] tracking-[-0.01em] text-[var(--solid-ink)]">
        {prompt}
      </h1>
      <button
        type="button"
        onClick={() => speakEnglish(prompt)}
        className="mx-auto mt-3 inline-flex items-center gap-[5px] rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-[5px] text-[11px] font-semibold text-[var(--color-muted)]"
      >
        <Icon name="volume_up" size={12} />
        読み上げ
      </button>
    </div>
  );
}

/**
 * 選択肢。2×2 のグリッドに置く前提で、面は正方形寄り・ラベルは中央。
 * 記号（A〜D）は左上のコーナーに逃がして、意味の可読性を落とさない。
 */
export function BattleChoiceButton({
  label,
  index,
  state,
  onSelect,
}: {
  label: string;
  index: number;
  state: BattleChoiceState;
  onSelect: () => void;
}) {
  const disabled = state !== 'idle';

  let faceBg = 'var(--color-surface)';
  let borderColor = 'var(--solid-ink)';
  let shadowColor = 'var(--solid-ink)';
  let textColor = 'var(--solid-ink)';
  let badgeBg = 'var(--color-surface-secondary)';
  let badgeColor = 'var(--color-muted)';
  let icon: string | null = null;

  if (state === 'correct') {
    faceBg = 'var(--color-accent)';
    borderColor = 'var(--color-accent-ink)';
    shadowColor = 'var(--color-accent-ink)';
    textColor = '#fff';
    badgeBg = 'rgba(255,255,255,0.22)';
    badgeColor = '#fff';
    icon = 'check';
  } else if (state === 'wrong') {
    faceBg = 'var(--color-error)';
    borderColor = '#b91c1c';
    shadowColor = '#b91c1c';
    textColor = '#fff';
    badgeBg = 'rgba(255,255,255,0.22)';
    badgeColor = '#fff';
    icon = 'close';
  } else if (state === 'muted') {
    borderColor = 'var(--color-border)';
    shadowColor = 'var(--color-border)';
    textColor = 'var(--color-muted)';
  } else if (state === 'selected') {
    faceBg = 'var(--color-surface-secondary)';
    badgeBg = 'var(--solid-ink)';
    badgeColor = 'var(--color-surface)';
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        triggerHaptic();
        onSelect();
      }}
      className={`relative h-full w-full disabled:cursor-default ${state === 'locked' ? 'opacity-55' : ''}`}
    >
      {/* ハードシャドウの受け皿（クイズの選択肢と同じ作り） */}
      <div
        className="absolute inset-0 rounded-[14px]"
        style={{ transform: 'translate(2.5px, 2.5px)', background: shadowColor }}
      />
      <div
        className="relative flex h-full min-h-[86px] flex-col items-center justify-center rounded-[14px] border-2 px-2.5 py-3"
        style={{ background: faceBg, borderColor }}
      >
        <span
          className="absolute left-2 top-2 flex h-[20px] w-[20px] items-center justify-center rounded-[6px] font-mono text-[10px] font-bold"
          style={{ background: badgeBg, color: badgeColor }}
        >
          {CHOICE_LABELS[index] ?? index + 1}
        </span>
        {icon && (
          <Icon
            name={icon}
            size={16}
            className="absolute right-2 top-2"
            style={{ color: textColor }}
          />
        )}
        <span
          className="break-words text-center text-[15px] font-bold leading-[1.35]"
          style={{ color: textColor }}
        >
          {label}
        </span>
      </div>
    </button>
  );
}

export type BattleRoundOutcome = 'won' | 'lost' | 'timeout' | 'answered' | 'missed' | 'live';

const OUTCOME_STYLE: Record<
  Exclude<BattleRoundOutcome, 'live'>,
  { icon: string; text: string; bg: string; border: string; color: string }
> = {
  won: {
    icon: 'bolt',
    text: '正解！ +1',
    bg: 'var(--color-accent)',
    border: 'var(--color-accent-ink)',
    color: 'var(--color-on-ink)',
  },
  lost: {
    icon: 'flash_off',
    text: '相手が先に正解',
    bg: 'var(--color-error)',
    border: '#b91c1c',
    // --color-error はダークでも赤のままなので、ここは白のままが正しい
    color: '#fff',
  },
  timeout: {
    icon: 'timer_off',
    text: '時間切れ',
    bg: 'var(--color-surface-secondary)',
    border: 'var(--solid-ink)',
    color: 'var(--solid-ink)',
  },
  answered: {
    icon: 'hourglass_top',
    text: '相手の回答を待っています...',
    bg: 'var(--color-surface-secondary)',
    border: 'var(--color-border)',
    color: 'var(--color-muted)',
  },
  // 誤答は「そのラウンドの失権」。決着はまだなので相手の回答を待つ。
  missed: {
    icon: 'close',
    text: '不正解... 相手の回答待ち',
    bg: 'var(--color-error-light)',
    border: 'var(--color-error)',
    color: 'var(--color-error)',
  },
};

/**
 * ラウンドの状況を伝えるピル。
 * 決着時に現れても盤面がずれないよう、呼び出し側で高さを確保した枠に置く。
 */
export function BattleRoundStatus({ outcome }: { outcome: BattleRoundOutcome }) {
  if (outcome === 'live') return null;

  const style = OUTCOME_STYLE[outcome];
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5"
      style={{ background: style.bg, borderColor: style.border, color: style.color }}
    >
      <Icon name={style.icon} size={15} />
      <span className="font-display text-[12.5px] font-extrabold">{style.text}</span>
    </div>
  );
}
