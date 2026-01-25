'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { WordButton, WordButtonState } from './WordButton';

interface WordPoolProps {
  words: string[];
  selectedWords: string[];
  onWordSelect: (word: string) => void;
  disabled?: boolean;
  className?: string;
  correctAnswer?: string | string[];
  showResult?: boolean;
}

export function WordPool({
  words,
  selectedWords,
  onWordSelect,
  disabled = false,
  className,
  correctAnswer,
  showResult = false,
}: WordPoolProps) {
  const getWordState = (word: string): WordButtonState => {
    const isSelected = selectedWords.includes(word);

    if (showResult) {
      const correctWords = Array.isArray(correctAnswer)
        ? correctAnswer
        : correctAnswer?.split(' ') || [];
      const isCorrectWord = correctWords.includes(word);

      if (isCorrectWord && !isSelected) {
        // Highlight correct answer that wasn't selected
        return 'correct';
      }
      return 'disabled';
    }

    if (isSelected) {
      return 'disabled';
    }

    return 'default';
  };

  return (
    <div
      className={cn(
        'flex flex-wrap justify-center gap-3 p-4',
        className
      )}
    >
      <AnimatePresence>
        {words.map((word, index) => {
          const state = getWordState(word);
          const isSelected = selectedWords.includes(word);

          return (
            <motion.div
              key={`${word}-${index}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: isSelected ? 0.4 : 1,
                scale: 1,
              }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <WordButton
                word={word}
                state={state}
                onClick={() => onWordSelect(word)}
                disabled={disabled || isSelected}
                showIcon={showResult && state === 'correct'}
                layoutId={`pool-${word}-${index}`}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
