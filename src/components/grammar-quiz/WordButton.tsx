'use client';

import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WordButtonState =
  | 'default'
  | 'hover'
  | 'selected'
  | 'disabled'
  | 'correct'
  | 'incorrect';

interface WordButtonProps {
  word: string;
  state?: WordButtonState;
  onClick?: () => void;
  disabled?: boolean;
  showIcon?: boolean;
  className?: string;
  layoutId?: string;
}

const stateStyles: Record<WordButtonState, string> = {
  default: 'bg-white border-gray-200 text-gray-800 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:scale-[0.97]',
  hover: 'bg-gray-50 border-gray-300 text-gray-800 shadow-md',
  selected: 'bg-emerald-50 border-emerald-400 text-emerald-700 shadow-sm',
  disabled: 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed',
  correct: 'bg-emerald-500 border-emerald-600 text-white shadow-sm',
  incorrect: 'bg-red-500 border-red-600 text-white shadow-sm',
};

export function WordButton({
  word,
  state = 'default',
  onClick,
  disabled = false,
  showIcon = false,
  className,
  layoutId,
}: WordButtonProps) {
  const isInteractive = state === 'default' || state === 'selected';
  const effectiveDisabled = disabled || state === 'disabled';

  return (
    <motion.button
      layoutId={layoutId}
      onClick={effectiveDisabled ? undefined : onClick}
      disabled={effectiveDisabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5',
        'min-w-[60px] h-12 px-5',
        'rounded-full border-2',
        'text-base font-medium',
        'transition-colors duration-150',
        'select-none',
        stateStyles[state],
        className
      )}
      initial={false}
      animate={{
        scale: state === 'correct' ? [1, 1.05, 1] : 1,
      }}
      transition={{
        scale: { duration: 0.3, ease: 'easeOut' },
        layout: { type: 'spring', stiffness: 500, damping: 30 },
      }}
      whileTap={isInteractive ? { scale: 0.97 } : undefined}
    >
      {showIcon && state === 'correct' && (
        <Check className="w-4 h-4" strokeWidth={3} />
      )}
      {showIcon && state === 'incorrect' && (
        <X className="w-4 h-4" strokeWidth={3} />
      )}
      {word}
    </motion.button>
  );
}

// Shake animation for incorrect answers
export function ShakingWordButton(props: WordButtonProps) {
  return (
    <motion.div
      animate={{
        x: props.state === 'incorrect' ? [0, -4, 4, -4, 4, -2, 2, 0] : 0,
      }}
      transition={{ duration: 0.4 }}
    >
      <WordButton {...props} />
    </motion.div>
  );
}
