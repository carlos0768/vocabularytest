'use client';

export interface GeneratingProjectCardProps {
  title: string;
  /** Optional data URL (e.g. base64) set during project name step */
  iconDataUrl?: string;
}

/**
 * Non-interactive placeholder shown while a new wordbook scan is in progress (web parity with iOS GeneratingProjectCard).
 */
export function GeneratingProjectCard({ title, iconDataUrl }: GeneratingProjectCardProps) {
  return (
    <div
      className="card p-4 flex items-center gap-4 border border-[var(--color-primary)]/25 shadow-none cursor-default select-none pointer-events-none"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${title} を生成中`}
    >
      <div className="relative w-14 h-14 rounded-xl shrink-0 overflow-hidden bg-[var(--color-surface-secondary)]">
        {iconDataUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconDataUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-90"
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/30 to-[var(--color-primary)]/5" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="pointer-events-none w-9 h-9 rounded-full border-[3px] border-white/25 border-t-white animate-spin"
            aria-hidden
          />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold text-[var(--color-foreground)] truncate">{title}</p>
        <p className="text-sm font-semibold text-[var(--color-primary)] mt-0.5">生成中...</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="h-6 w-14 rounded-full bg-[var(--color-border)]/80 animate-pulse" />
          <span className="h-6 w-14 rounded-full bg-[var(--color-border)]/80 animate-pulse [animation-delay:150ms]" />
          <span className="h-6 w-14 rounded-full bg-[var(--color-border)]/80 animate-pulse [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
