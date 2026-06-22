'use client';

import { SolidPanel } from '@/components/redesign/SolidPage';

export interface GeneratingProjectCardProps {
  title: string;
  iconDataUrl?: string;
}

export function GeneratingProjectCard({ title, iconDataUrl }: GeneratingProjectCardProps) {
  return (
    <SolidPanel
      as="div"
      className="!rounded-[14px] !shadow-none !border-2 cursor-default select-none pointer-events-none"
      faceClassName="!p-[13px]"
    >
      <div
        className="flex items-center gap-[13px]"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={`${title} を生成中`}
      >
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] overflow-hidden bg-[var(--color-surface-secondary)]"
          style={iconDataUrl ? { background: `center / cover url(${iconDataUrl})` } : undefined}
        >
          {!iconDataUrl && (
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary)]/30 to-[var(--color-primary)]/5" />
          )}
          <div
            className="scanvocab-generating-spin pointer-events-none h-7 w-7 text-[var(--color-primary)]"
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
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-[var(--solid-ink)]">{title}</div>
          <div className="mt-px flex items-baseline gap-0.5">
            <span className="font-display text-lg font-extrabold text-[var(--color-primary)]">生成中...</span>
          </div>
          <div className="mt-[3px] flex gap-2.5">
            <span className="inline-flex items-center gap-1">
              <span className="scanvocab-generating-pulse h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
              <span className="text-[10px] text-[var(--color-muted)]">AI処理中</span>
            </span>
          </div>
        </div>
      </div>
    </SolidPanel>
  );
}
