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
        'border-2 flex items-center gap-3',
        'active:scale-[0.98]',
        // Default state
        !isRevealed && 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50',
        // Revealed states
        isRevealed && isCorrect && 'border-green-500 bg-green-50 animate-correct',
        isRevealed && isSelected && !isCorrect && 'border-red-500 bg-red-50',
        isRevealed && !isSelected && !isCorrect && 'border-gray-200 bg-gray-50 opacity-50',
        // Disabled
        disabled && !isRevealed && 'cursor-not-allowed opacity-60'
      )}
    >
      {/* Option label */}
      <span
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0',
          !isRevealed && 'bg-gray-100 text-gray-600',
          isRevealed && isCorrect && 'bg-green-500 text-white',
          isRevealed && isSelected && !isCorrect && 'bg-red-500 text-white',
          isRevealed && !isSelected && !isCorrect && 'bg-gray-200 text-gray-400'
        )}
      >
        {optionLabels[index]}
      </span>

      {/* Answer text */}
      <span
        className={cn(
          'text-lg',
          !isRevealed && 'text-gray-900',
          isRevealed && isCorrect && 'text-green-700 font-medium',
          isRevealed && isSelected && !isCorrect && 'text-red-700',
          isRevealed && !isSelected && !isCorrect && 'text-gray-400'
        )}
      >
        {label}
      </span>
    </button>
  );
}
