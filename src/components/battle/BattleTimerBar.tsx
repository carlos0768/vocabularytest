'use client';

/**
 * ラウンドの残り時間バー。
 * 締切はサーバーが持っているので、ここは remainingMs を描くだけの純表示。
 */

const BATTLE_TIMER_WARNING_MS = 3_000;

export function BattleTimerBar({
  remainingMs,
  totalMs,
  progressLabel,
  paused = false,
}: {
  remainingMs: number;
  totalMs: number;
  /** 「3 / 10」のような進行状況。 */
  progressLabel: string;
  /** ラウンド決着後は減り続けないよう止める。 */
  paused?: boolean;
}) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const warning = !paused && remainingMs <= BATTLE_TIMER_WARNING_MS;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Q {progressLabel}
        </span>
        <span
          className={`font-mono text-[11px] font-bold tabular-nums ${
            warning ? 'text-[var(--color-error)]' : 'text-[var(--color-muted)]'
          }`}
        >
          {paused ? '--' : `${seconds}s`}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${
            warning ? 'bg-[var(--color-error)]' : 'bg-[var(--color-accent)]'
          }`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
