import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * DS風の選択肢カード（影付きプレート）。
 * 単語帳クイズ (/quiz/*) と語法クイズ (/grammar/*) で共用する。
 */
export function DSQuizOption({
  label,
  index,
  isSelected,
  isCorrect,
  isRevealed,
  onSelect,
  disabled,
}: {
  label: string;
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const isCorrectAnswer = isRevealed && isCorrect;
  const isWrongAnswer = isRevealed && isSelected && !isCorrect;
  const isInactive = isRevealed && !isSelected && !isCorrect;

  let faceBg = '#fff';
  let borderColor = 'var(--solid-ink)';
  let shadowColor = 'var(--solid-ink)';
  let textColor = 'var(--solid-ink)';
  let badgeBg = '#fff';
  let badgeColor = 'var(--solid-ink)';
  let icon: ReactNode = null;

  if (isCorrectAnswer) {
    faceBg = 'var(--color-accent)';
    borderColor = 'var(--color-accent-ink)';
    shadowColor = 'var(--color-accent-ink)';
    textColor = '#fff';
    badgeBg = 'rgba(255,255,255,0.22)';
    badgeColor = '#fff';
    icon = <Icon name="check" size={18} className="text-white" />;
  } else if (isWrongAnswer) {
    faceBg = 'var(--color-error)';
    borderColor = '#b91c1c';
    shadowColor = '#b91c1c';
    textColor = '#fff';
    badgeBg = 'rgba(255,255,255,0.22)';
    badgeColor = '#fff';
    icon = <Icon name="close" size={18} className="text-white" />;
  } else if (isInactive) {
    borderColor = 'var(--color-border)';
    shadowColor = 'var(--color-border)';
    textColor = 'var(--color-muted)';
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="relative w-full text-left disabled:cursor-not-allowed"
    >
      {/* shadow plate */}
      <div
        className="absolute inset-0 rounded-xl"
        style={{ transform: 'translate(2.5px, 2.5px)', background: shadowColor }}
      />
      <div
        className="relative flex items-center gap-[11px] rounded-xl border-2 px-3.5 py-3.5"
        style={{ background: faceBg, borderColor }}
      >
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-[var(--solid-ink)] font-mono text-[11px] font-bold"
          style={{ background: badgeBg, color: badgeColor }}
        >
          {String.fromCharCode(65 + index)}
        </div>
        <div className="flex-1 text-[15px] font-semibold leading-[1.35]" style={{ color: textColor }}>
          {label}
        </div>
        {icon}
      </div>
    </button>
  );
}
