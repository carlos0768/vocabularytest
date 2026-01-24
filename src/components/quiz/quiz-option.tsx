'use client';

import { cn } from '@/lib/utils';

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

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'w-full p-4 rounded-xl text-left transition-all duration-200',
        'flex items-center gap-3',
        'active:scale-[0.98]',
        // Default state
        !isRevealed && 'bg-gray-50 hover:bg-gray-100',
        // Revealed states
        isRevealed && isCorrect && 'bg-emerald-50 animate-correct',
        isRevealed && isSelected && !isCorrect && 'bg-red-50',
        isRevealed && !isSelected && !isCorrect && 'bg-gray-50 opacity-40',
        // Disabled
        disabled && !isRevealed && 'cursor-not-allowed opacity-60'
      )}
    >
      {/* Option label */}
      <span
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium flex-shrink-0',
          !isRevealed && 'bg-gray-200 text-gray-600',
          isRevealed && isCorrect && 'bg-emerald-500 text-white',
          isRevealed && isSelected && !isCorrect && 'bg-red-500 text-white',
          isRevealed && !isSelected && !isCorrect && 'bg-gray-200 text-gray-400'
        )}
      >
        {optionLabels[index]}
      </span>

      {/* Answer text */}
      <span
        className={cn(
          'text-base',
          !isRevealed && 'text-gray-900',
          isRevealed && isCorrect && 'text-emerald-700 font-medium',
          isRevealed && isSelected && !isCorrect && 'text-red-700',
          isRevealed && !isSelected && !isCorrect && 'text-gray-400'
        )}
      >
        {label}
      </span>
    </button>
  );
}
