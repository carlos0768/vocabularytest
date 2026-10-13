'use client';

// 単語帳ページ (`/project/[id]`) のヘッダーのボタン類。
import { Icon } from '@/components/ui/Icon';

export function HeaderBtn({
  children,
  onClick,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

/**
 * 下部バーの赤シートの切り替え。ボタンの枠は出さず、赤いカードそのものを置く
 * (タップ範囲だけ44px確保する)。英語側・訳側で同じ見た目にする。
 */
export function RedSheetToggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      <span
        className={`block h-[32px] w-[24px] rounded-[5px] border-2 transition-colors duration-100 ${
          on
            ? 'border-[var(--solid-ink)] bg-[#e0483f]'
            : 'border-[rgba(224,72,63,0.55)] bg-[rgba(224,72,63,0.35)]'
        }`}
      />
    </button>
  );
}

export function MenuButton({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-[var(--color-border-light)] px-3.5 py-3 text-left text-[13px] font-bold last:border-b-0 active:bg-[var(--color-surface-secondary)]"
      style={{ color: destructive ? 'var(--color-error, #cc4d59)' : 'var(--solid-ink)' }}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}
