'use client';

import { Icon } from '@/components/ui';
import { useTheme } from '@/components/theme-provider';
import { THEME_LABELS, THEME_OPTIONS, type Theme } from '@/lib/theme';

const THEME_ICONS: Record<Theme, string> = {
  light: 'light_mode',
  dark: 'dark_mode',
  system: 'contrast',
};

const THEME_HINTS: Record<Theme, string> = {
  light: '明るい配色',
  dark: '暗い配色',
  system: '端末の設定に合わせる',
};

/**
 * ライト / ダーク / システム の切り替え。
 *
 * 選択は localStorage に保存され（ThemeProvider）、<html> の dark クラスとして
 * 即座に反映される。サーバーには送らないので、端末ごとの設定になる。
 */
export function ThemeSelector({ className = '' }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="テーマ"
        className="grid grid-cols-3 gap-1.5"
      >
        {THEME_OPTIONS.map((option) => {
          const selected = theme === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              // アイコンは Material Symbols のリガチャ（本文が "dark_mode"）なので、
              // 明示しないと読み上げ名が「dark_mode ダーク」になってしまう
              aria-label={THEME_LABELS[option]}
              onClick={() => setTheme(option)}
              className={[
                'flex flex-col items-center gap-1 rounded-[10px] border-2 px-2 py-2.5 transition-all duration-100',
                'font-display text-[12px] font-bold active:translate-x-px active:translate-y-px',
                selected
                  ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white shadow-[2px_2px_0_var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-secondary-text)]',
              ].join(' ')}
            >
              <Icon name={THEME_ICONS[option]} size={18} filled={selected} />
              {THEME_LABELS[option]}
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-0.5 text-[10px] leading-4 text-[var(--color-muted)]">
        {THEME_HINTS[theme]}
        {theme === 'system' && `（いまは${THEME_LABELS[resolvedTheme]}）`}
        ・この端末のみに保存されます
      </p>
    </div>
  );
}
