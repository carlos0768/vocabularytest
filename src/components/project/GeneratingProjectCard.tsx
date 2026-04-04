'use client';

export interface GeneratingProjectCardProps {
  title: string;
  /** Optional data URL (e.g. base64) set during project name step */
  iconDataUrl?: string;
}

/**
 * Non-interactive placeholder shown while a new wordbook scan is in progress.
 *
 * Animations are defined via an inline <style> tag to bypass Tailwind v4's
 * CSS cascade layers / PostCSS pipeline which was stripping or deprioritising
 * the keyframes when they lived in globals.css.
 */
export function GeneratingProjectCard({ title, iconDataUrl }: GeneratingProjectCardProps) {
  return (
    <>
      {/* Inline keyframes — immune to Tailwind/PostCSS processing */}
      <style>{`
        @keyframes _mgSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes _mgChipPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.28; }
        }
      `}</style>

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
              style={{
                animation: '_mgSpin 0.85s linear infinite',
                transformOrigin: 'center center',
                willChange: 'transform',
                display: 'inline-flex',
              }}
              className="pointer-events-none h-9 w-9 text-[var(--color-primary)]"
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
            <span
              className="h-6 w-14 rounded-full bg-[var(--color-border)]"
              style={{ animation: '_mgChipPulse 1.15s ease-in-out infinite' }}
            />
            <span
              className="h-6 w-14 rounded-full bg-[var(--color-border)]"
              style={{ animation: '_mgChipPulse 1.15s ease-in-out infinite', animationDelay: '0.18s' }}
            />
            <span
              className="h-6 w-14 rounded-full bg-[var(--color-border)]"
              style={{ animation: '_mgChipPulse 1.15s ease-in-out infinite', animationDelay: '0.36s' }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
