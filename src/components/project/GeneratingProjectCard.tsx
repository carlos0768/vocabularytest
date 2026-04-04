'use client';

export interface GeneratingProjectCardProps {
  title: string;
  /** Optional data URL (e.g. base64) set during project name step */
  iconDataUrl?: string;
}

/**
 * Non-interactive placeholder shown while a new wordbook scan is in progress.
 *
 * Uses Tailwind's built-in `animate-spin` / `animate-pulse` utilities instead
 * of custom @keyframes. Custom keyframes via inline <style> tags were being
 * stripped by the production CSS pipeline (optimizeCss + Tailwind v4 layers).
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
      {/* Icon / spinner */}
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
          <div
            className="animate-spin pointer-events-none h-9 w-9 text-[var(--color-primary)]"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-full w-full" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                className="opacity-[0.22]"
              />
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="15.7 47.1"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Text + shimmer chips */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-[var(--color-foreground)] truncate">{title}</p>
        <p className="text-sm font-semibold text-[var(--color-primary)] mt-0.5">生成中...</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="animate-pulse h-6 w-14 rounded-full bg-[var(--color-border)]" />
          <span
            className="animate-pulse h-6 w-14 rounded-full bg-[var(--color-border)]"
            style={{ animationDelay: '0.18s' }}
          />
          <span
            className="animate-pulse h-6 w-14 rounded-full bg-[var(--color-border)]"
            style={{ animationDelay: '0.36s' }}
          />
        </div>
      </div>
    </div>
  );
}
