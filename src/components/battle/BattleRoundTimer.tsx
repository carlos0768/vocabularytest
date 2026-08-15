'use client';

/**
 * ラウンド進行と残り時間。残りが少ないほど赤に寄せ、決着済みのラウンドでは
 * バーを止めて「次の問題へ」に切り替える（時間切れと決着を見間違えないため）。
 */

import { cn } from '@/lib/utils';

const BATTLE_TIMER_WARNING_MS = 3_000;

export function BattleRoundTimer({
  roundLabel,
  remainingMs,
  roundDurationMs,
  resolved,
}: {
  roundLabel: string;
  remainingMs: number;
  roundDurationMs: number;
  resolved: boolean;
}) {
  const ratio = roundDurationMs > 0 ? Math.max(0, Math.min(1, remainingMs / roundDurationMs)) : 0;
  const warning = !resolved && remainingMs <= BATTLE_TIMER_WARNING_MS;
  const secondsLeft = Math.ceil(remainingMs / 1000);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          ROUND {roundLabel}
        </span>
        <span
          className={cn(
            'font-mono text-[11px] font-bold tabular-nums',
            warning ? 'text-[var(--color-error)]' : 'text-[var(--color-muted)]',
          )}
        >
          {resolved ? '次の問題へ' : `残り ${secondsLeft}秒`}
        </span>
      </div>

      <div
        className="h-[7px] overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]"
        role="progressbar"
        aria-label="残り時間"
        aria-valuemin={0}
        aria-valuemax={roundDurationMs}
        aria-valuenow={Math.round(remainingMs)}
      >
        <div
          className={cn(
            'h-full transition-[width] duration-100 ease-linear',
            resolved
              ? 'bg-[var(--color-muted)]'
              : warning
                ? 'bg-[var(--color-error)]'
                : 'bg-[var(--color-accent)]',
          )}
          style={{ width: `${resolved ? 100 : ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
