'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GrammarQuizQuestion } from '@/types';

interface GrammarWordTapProps {
  question: GrammarQuizQuestion;
  onAnswer: (isCorrect: boolean) => void;
}

export function GrammarWordTap({ question, onAnswer }: GrammarWordTapProps) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const options = question.wordOptions ?? [];

  const handleTap = (word: string) => {
    if (revealed) return;
    setSelectedWord(word);
    setRevealed(true);
    const isCorrect = options.find((o) => o.word === word)?.isCorrect ?? false;
    onAnswer(isCorrect);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Question */}
      <div className="px-5">
        <p className="text-base font-bold text-[var(--color-foreground)] leading-relaxed">
          {question.question}
        </p>
        {question.questionJa && (
          <p className="text-sm text-[var(--color-muted)] mt-1">{question.questionJa}</p>
        )}
      </div>

      {/* Word chips */}
      <div className="px-5 flex flex-wrap gap-2.5">
        {options.map((option) => {
          const isSelected = selectedWord === option.word;
          const isCorrect = option.isCorrect;
          const isCorrectAnswer = revealed && isCorrect;
          const isWrongAnswer = revealed && isSelected && !isCorrect;
          const isInactive = revealed && !isSelected && !isCorrect;

          return (
            <button
              key={option.word}
              onClick={() => handleTap(option.word)}
              disabled={revealed}
              className={`px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-150 ${
                isCorrectAnswer
                  ? 'bg-[var(--color-success)] border-[var(--color-success)] text-white'
                  : isWrongAnswer
                  ? 'bg-[var(--color-error)] border-[var(--color-error)] text-white'
                  : isInactive
                  ? 'border-[var(--color-border)] opacity-40'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] active:scale-95'
              }`}
            >
              {option.word}
              {isCorrectAnswer && <Icon name="check" size={16} className="inline ml-1" />}
              {isWrongAnswer && <Icon name="close" size={16} className="inline ml-1" />}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {revealed && (
        <div className="px-5 animate-fade-in">
          <div className="bg-[var(--color-surface-secondary)] rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-[var(--color-primary)] mb-1">
              正解: {question.correctAnswer}
            </p>
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">{question.explanation}</p>
          </div>
        </div>
      )}
    </div>
  );
}
