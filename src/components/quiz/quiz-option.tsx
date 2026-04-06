'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/**
 * 訳テキストから先頭の括弧表現を除去する。
 * - 「、」や「,」を含まない場合: 先頭の (…) を除去（途中のものはそのまま）
 * - 「、」や「,」を含む場合: 区切りごとの各部分に同じルールを適用
 */
function stripLeadingParens(text: string): string {
  const stripPart = (part: string): string => {
    const trimmed = part.trim();
    if (trimmed.startsWith('(') || trimmed.startsWith('（')) {
      return trimmed.replace(/^[（(][^）)]*[）)]/, '').trim();
    }
    return trimmed;
  };

  if (text.includes('、') || text.includes(',')) {
    return text.split(/[、,]/).map(stripPart).join('、');
  }
  return stripPart(text);
}

interface QuizOptionProps {
  label: string;
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  onSelect: () => void;
  disabled: boolean;
}

export function QuizOption({
  label,
  index,
  isSelected,
  isCorrect,
  isRevealed,
  onSelect,
  disabled,
}: QuizOptionProps) {
  const optionLabels = ['A', 'B', 'C', 'D'];

  // Determine the visual state
  const isCorrectAnswer = isRevealed && isCorrect;
  const isWrongAnswer = isRevealed && isSelected && !isCorrect;
  const isInactive = isRevealed && !isSelected && !isCorrect;

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'quiz-option group relative w-full text-left',
        // Correct answer state
        isCorrectAnswer && 'quiz-option-correct',
        // Wrong answer state
        isWrongAnswer && 'quiz-option-wrong',
        // Inactive state (not selected, not correct)
        isInactive && 'opacity-50',
        // Disabled without reveal
        disabled && !isRevealed && 'cursor-not-allowed opacity-60'
      )}
    >
      {/* Option label (A, B, C, D) */}
      <div
        className={cn(
          'quiz-option-label',
          isCorrectAnswer && 'bg-white/20 text-white',
          isWrongAnswer && 'bg-white/20 text-white'
        )}
      >
        {optionLabels[index]}
      </div>

      {/* Answer text */}
      <span
        className={cn(
          'flex-1 px-4 py-3 text-base font-medium leading-tight',
          !isRevealed && 'text-[var(--color-foreground)]',
          isCorrectAnswer && 'text-white',
          isWrongAnswer && 'text-white',
          isInactive && 'text-[var(--color-muted)]'
        )}
      >
        {stripLeadingParens(label)}
      </span>

      {/* Result icon */}
      {isCorrectAnswer && (
        <Icon name="check" size={24} className="text-white mr-1" />
      )}
      {isWrongAnswer && (
        <Icon name="close" size={24} className="text-white mr-1" />
      )}
    </button>
  );
}
