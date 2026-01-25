'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { WordButton, WordButtonState } from './WordButton';

export type AnswerAreaState = 'empty' | 'filled' | 'correct' | 'incorrect';

interface AnswerAreaProps {
  selectedWords: string[];
  onWordRemove?: (word: string, index: number) => void;
  state?: AnswerAreaState;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  correctAnswer?: string | string[];
}

const areaStyles: Record<AnswerAreaState, string> = {
  empty: 'border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100',
  filled: 'border-solid border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100',
  correct: 'border-solid border-emerald-400 bg-gradient-to-br from-emerald-50 to-emerald-100',
  incorrect: 'border-solid border-red-400 bg-gradient-to-br from-red-50 to-red-100',
};

export function AnswerArea({
  selectedWords,
  onWordRemove,
  state = 'empty',
  placeholder = 'タップして単語を選択',
  disabled = false,
  className,
  correctAnswer,
}: AnswerAreaProps) {
  const effectiveState = selectedWords.length === 0 ? 'empty' : state;

  const getWordState = (word: string): WordButtonState => {
    if (state === 'correct') return 'correct';
    if (state === 'incorrect') {
      // Check if this word is in the correct answer
      const correctWords = Array.isArray(correctAnswer)
        ? correctAnswer
        : correctAnswer?.split(' ') || [];
      const isCorrectWord = correctWords.includes(word);
      return isCorrectWord ? 'correct' : 'incorrect';
    }
    return 'selected';
  };

  return (
    <motion.div
      className={cn(
        'min-h-[80px] p-4 rounded-2xl border-2',
        'flex flex-wrap items-center justify-center gap-3',
        'transition-colors duration-200',
        areaStyles[effectiveState],
        className
      )}
      animate={{
        x: state === 'incorrect' ? [0, -4, 4, -4, 4, 0] : 0,
      }}
      transition={{ duration: 0.4 }}
    >
      <AnimatePresence mode="popLayout">
        {selectedWords.length === 0 ? (
          <motion.p
            key="placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-gray-400 text-sm select-none"
          >
            {placeholder}
          </motion.p>
        ) : (
          selectedWords.map((word, index) => (
            <motion.div
              key={`${word}-${index}`}
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -20 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <WordButton
                word={word}
                state={getWordState(word)}
                onClick={() => !disabled && onWordRemove?.(word, index)}
                disabled={disabled || state === 'correct' || state === 'incorrect'}
                showIcon={state === 'correct' || state === 'incorrect'}
                layoutId={`word-${word}-${index}`}
              />
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </motion.div>
  );
}
