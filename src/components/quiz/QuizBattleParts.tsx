'use client';

/**
 * クイズ画面を対戦画面と同じ見た目にするための、一人用の部品。
 * 対戦の `BattleScoreboard` / `BattleRoundStatus` に相当する (相手がいないので
 * 自分の進捗とタイマーだけを出す)。出題カードと選択肢は対戦の部品をそのまま使う。
 */

import { Icon } from '@/components/ui/Icon';
import { TIME_ATTACK_URGENT_MS } from '@/lib/quiz/time-attack';

export type QuizBoardResult = boolean | 'skip' | null;

/** 固定ヘッダに載せる進捗帯。問題ごとの結果セグメントと、タイムアタックのときだけタイマー。 */
export function QuizProgressBoard({
  total,
  currentIndex,
  answerResults,
  correct,
  timer,
}: {
  total: number;
  currentIndex: number;
  answerResults: readonly QuizBoardResult[];
  correct: number;
  /** タイムアタックのときだけ渡す。 */
  timer?: { remainingMs: number; durationMs: number; paused: boolean };
}) {
  const secondsLeft = timer ? Math.ceil(timer.remainingMs / 1000) : 0;
  const urgent = Boolean(timer) && !timer!.paused && timer!.remainingMs <= TIME_ATTACK_URGENT_MS;
  const ratio = timer && timer.durationMs > 0
    ? Math.max(0, Math.min(1, timer.remainingMs / timer.durationMs))
    : 0;

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-3">
        <div className="shrink-0 text-center">
          <div className="font-display text-[24px] font-black leading-none tabular-nums text-[var(--solid-ink)]">
            {correct}
          </div>
          <div className="mt-1 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
            正解
          </div>
        </div>
        <div className="flex min-w-0 flex-1 gap-[3px]" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => {
            const result = answerResults[i];
            const background = i < currentIndex
              ? result === true
                ? 'var(--color-success)'
                : result === false
                  ? 'var(--color-error)'
                  : result === 'skip'
                    ? 'var(--color-warning)'
                    : 'color-mix(in srgb, var(--solid-ink) 10%, transparent)'
              : i === currentIndex
                ? 'var(--solid-ink)'
                : 'color-mix(in srgb, var(--solid-ink) 10%, transparent)';
            return <div key={i} className="h-[5px] flex-1 rounded-sm" style={{ background }} />;
          })}
        </div>
        <div className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-[var(--solid-ink)]">
          {currentIndex + 1}
          <span className="text-[var(--color-muted)]">/{total}</span>
        </div>
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

export type QuizRoundOutcome = 'correct' | 'wrong' | 'timeout' | 'skip' | 'live';

const OUTCOME_STYLE: Record<
  Exclude<QuizRoundOutcome, 'live'>,
  { icon: string; text: string; bg: string; border: string; color: string }
> = {
  correct: {
    icon: 'bolt',
    text: '正解！',
    bg: 'var(--color-accent)',
    border: 'var(--color-accent-ink)',
    color: 'var(--color-on-accent)',
  },
  wrong: {
    icon: 'close',
    text: '不正解',
    bg: 'var(--color-error-fill)',
    border: 'var(--color-danger-strong)',
    color: '#fff',
  },
  timeout: {
    icon: 'timer_off',
    text: '時間切れ',
    bg: 'var(--color-surface-secondary)',
    border: 'var(--solid-ink)',
    color: 'var(--solid-ink)',
  },
  skip: {
    icon: 'help',
    text: 'わからない',
    bg: 'var(--color-surface-secondary)',
    border: 'var(--color-border)',
    color: 'var(--color-muted)',
  },
};

/** 答えたあとの結果を伝えるピル。対戦の `BattleRoundStatus` と同じ見た目。 */
export function QuizRoundStatus({ outcome }: { outcome: QuizRoundOutcome }) {
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
