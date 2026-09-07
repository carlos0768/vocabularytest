'use client';

import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme-provider';

type Option = { value: 'light' | 'dark' | 'system'; label: string; icon: string };

const OPTIONS: Option[] = [
  { value: 'light', label: 'ライト', icon: 'light_mode' },
  { value: 'dark', label: 'ダーク', icon: 'dark_mode' },
  { value: 'system', label: '端末に合わせる', icon: 'contrast' },
];

/**
 * 外観（テーマ）の切り替え。
 *
 * 3択にしているのは「端末に合わせる」が既定値だから — OSの設定を尊重しつつ、
 * アプリ側だけ固定したい人が明示的に上書きできるようにしている。
 */
export function ThemeSetting() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <div className="px-3 py-[11px]">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[color-mix(in_srgb,var(--solid-ink)_5%,transparent)] text-[var(--solid-ink)]">
          <Icon name={resolvedTheme === 'dark' ? 'dark_mode' : 'light_mode'} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[13px] font-bold text-[var(--solid-ink)]">外観</span>
          <p className="mt-px truncate text-[11px] leading-4 text-[var(--color-muted)]">
            {theme === 'system' ? `端末の設定に追従中（現在: ${resolvedTheme === 'dark' ? 'ダーク' : 'ライト'}）` : 'アプリ内で固定中'}
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label="外観"
        className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] p-1"
      >
        {OPTIONS.map((option) => {
          const active = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(option.value)}
              className={`flex flex-col items-center justify-center gap-1 rounded-[7px] px-1 py-2 font-display text-[10px] font-bold leading-none transition-colors ${
                active
                  ? 'bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
                  : 'text-[var(--color-muted)] hover:bg-[color-mix(in_srgb,var(--solid-ink)_6%,transparent)]'
              }`}
            >
              <Icon name={option.icon} size={16} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
