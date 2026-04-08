'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GrammarQuizQuestion } from '@/types';

interface GrammarSentenceBuildProps {
  question: GrammarQuizQuestion;
  onAnswer: (isCorrect: boolean) => void;
}

export function GrammarSentenceBuild({ question, onAnswer }: GrammarSentenceBuildProps) {
  const allWords = [...(question.sentenceWords ?? []), ...(question.extraWords ?? [])];
  const [availableWords, setAvailableWords] = useState(() =>
    [...allWords].sort(() => Math.random() - 0.5)
  );
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleTapWord = (word: string, index: number) => {
    if (revealed) return;
    setSelectedWords((prev) => [...prev, word]);
    setAvailableWords((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveWord = (index: number) => {
    if (revealed) return;
    const word = selectedWords[index];
    setSelectedWords((prev) => prev.filter((_, i) => i !== index));
    setAvailableWords((prev) => [...prev, word]);
  };

  const handleSubmit = () => {
    if (revealed) return;
    const userAnswer = selectedWords.join(' ');
    const correct = userAnswer === question.correctAnswer;
    setIsCorrect(correct);
    setRevealed(true);
    onAnswer(correct);
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

      {/* Answer zone */}
      <div className="px-5">
        <div className={`min-h-[60px] flex flex-wrap gap-2 items-start p-3 rounded-xl border-2 border-dashed transition-colors ${
          revealed
            ? isCorrect
              ? 'border-[var(--color-success)] bg-green-50'
              : 'border-[var(--color-error)] bg-red-50'
            : 'border-[var(--color-border)]'
        }`}>
          {selectedWords.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">単語をタップして文を作りましょう</p>
          ) : (
            selectedWords.map((word, index) => (
              <button
                key={`selected-${index}`}
                onClick={() => handleRemoveWord(index)}
                disabled={revealed}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  revealed
                    ? isCorrect
                      ? 'bg-[var(--color-success)] text-white'
                      : 'bg-[var(--color-error)] text-white'
                    : 'bg-[var(--color-foreground)] text-white active:scale-95'
                }`}
              >
                {word}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Word pool */}
      <div className="px-5 flex flex-wrap gap-2">
        {availableWords.map((word, index) => (
          <button
            key={`avail-${index}`}
            onClick={() => handleTapWord(word, index)}
            disabled={revealed}
            className="px-3 py-1.5 rounded-lg border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-foreground)] active:scale-95 transition-transform disabled:opacity-40"
          >
            {word}
          </button>
        ))}
      </div>

      {/* Submit button */}
      {!revealed && selectedWords.length > 0 && (
        <div className="px-5">
          <button
            onClick={handleSubmit}
            className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white font-bold text-sm active:scale-[0.98] transition-transform"
          >
            回答する
          </button>
        </div>
      )}

      {/* Explanation */}
      {revealed && (
        <div className="px-5 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            {isCorrect ? (
              <Icon name="check_circle" size={20} className="text-[var(--color-success)]" filled />
            ) : (
              <Icon name="cancel" size={20} className="text-[var(--color-error)]" filled />
            )}
            <span className={`text-sm font-bold ${isCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
              {isCorrect ? '正解！' : '不正解'}
            </span>
          </div>
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
