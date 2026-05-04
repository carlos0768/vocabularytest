'use client';

import type { VocabularyType } from '@/types';
import {
  getNextVocabularyType,
  getVocabularyTypeLabel,
  getVocabularyTypeShortLabel,
} from '@/lib/vocabulary-type';

interface VocabularyTypeButtonProps {
  vocabularyType: VocabularyType | null | undefined;
  onClick: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<VocabularyTypeButtonProps['size']>, string> = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-sm',
};

export function VocabularyTypeButton({
  vocabularyType,
  onClick,
  size = 'sm',
  className = '',
}: VocabularyTypeButtonProps) {
  const next = getNextVocabularyType(vocabularyType);
  const currentLabel = getVocabularyTypeLabel(vocabularyType);
  const nextLabel = getVocabularyTypeLabel(next);

  const toneClass =
    vocabularyType === 'active'
      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
      : vocabularyType === 'passive'
        ? 'border-[rgba(107,114,128,0.5)] bg-[rgba(107,114,128,0.5)] text-white'
        : 'border-[var(--color-border)] bg-transparent text-[var(--color-muted)]';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center justify-center rounded-full border font-black leading-none transition-colors hover:opacity-90 ${SIZE_CLASS[size]} ${toneClass} ${className}`.trim()}
      aria-label={`語彙モード: ${currentLabel}。押すと ${nextLabel} に変更`}
      title={`語彙モード: ${currentLabel} → ${nextLabel}`}
    >
      {getVocabularyTypeShortLabel(vocabularyType)}
    </button>
  );
}
