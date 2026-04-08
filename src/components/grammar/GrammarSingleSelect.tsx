'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GrammarQuizQuestion } from '@/types';

interface GrammarSingleSelectProps {
  question: GrammarQuizQuestion;
  onAnswer: (isCorrect: boolean) => void;
}

export function GrammarSingleSelect({ question, onAnswer }: GrammarSingleSelectProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const options = question.wordOptions ?? [];
  const correctIndex = options.findIndex((o) => o.isCorrect);

  const handleSelect = (index: number) => {
    if (revealed) return;
    setSelectedIndex(index);
    setRevealed(true);
    onAnswer(options[index].isCorrect);
  };

  const optionLabels = ['A', 'B', 'C', 'D', 'E'];

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

      {/* Options */}
      <div className="px-5 space-y-2.5">
        {options.map((option, index) => {
          const isSelected = selectedIndex === index;
          const isCorrect = option.isCorrect;
          const isCorrectAnswer = revealed && isCorrect;
          const isWrongAnswer = revealed && isSelected && !isCorrect;
          const isInactive = revealed && !isSelected && !isCorrect;

          return (
            <button
              key={index}
              onClick={() => handleSelect(index)}
              disabled={revealed}
              className={`w-full flex items-center rounded-xl border-2 transition-all duration-150 ${
                isCorrectAnswer
                  ? 'bg-[var(--color-success)] border-[var(--color-success)] text-white'
                  : isWrongAnswer
                  ? 'bg-[var(--color-error)] border-[var(--color-error)] text-white'
                  : isInactive
                  ? 'border-[var(--color-border)] opacity-50'
                  : isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] active:scale-[0.98]'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold m-1.5 shrink-0 ${
                isCorrectAnswer || isWrongAnswer
                  ? 'bg-white/20 text-white'
                  : 'bg-[var(--color-surface-secondary)] text-[var(--color-muted)]'
              }`}>
                {optionLabels[index]}
              </div>
              <span className="flex-1 px-3 py-3 text-sm font-semibold text-left">{option.word}</span>
              {isCorrectAnswer && <Icon name="check" size={20} className="text-white mr-3" />}
              {isWrongAnswer && <Icon name="close" size={20} className="text-white mr-3" />}
            </button>
          );
        })}
      </div>

      {/* Explanation after answer */}
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
