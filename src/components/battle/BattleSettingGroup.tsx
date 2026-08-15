'use client';

/**
 * 対戦設定のセグメント選択 (問題数・制限時間)。値の型は呼び出し側に任せる。
 */

import { cn } from '@/lib/utils';

export function BattleSettingGroup<T extends string | number>({
  label,
  eyebrow,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  eyebrow: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[9.5px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          {eyebrow}
        </span>
        <span className="font-display text-[13px] font-extrabold text-[var(--solid-ink)]">{label}</span>
      </div>

      <div
        role="group"
        aria-label={label}
        className="flex gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-1"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex-1 rounded-[8px] py-2 text-[13px] font-bold tabular-nums transition-colors duration-100 disabled:opacity-50',
                selected
                  ? 'bg-[var(--solid-ink)] text-[var(--color-surface)]'
                  : 'text-[var(--color-muted)] active:bg-[var(--color-surface-secondary)]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
