'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FillInBlankQuestion as FillInBlankQuestionType } from '@/types';

interface FillInBlankQuestionProps {
  question: FillInBlankQuestionType;
  onAnswer: (isCorrect: boolean) => void;
}

export function FillInBlankQuestion({ question, onAnswer }: FillInBlankQuestionProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 問題が変わったら状態をリセット
  const [currentQuestionId, setCurrentQuestionId] = useState(question.wordId);
  if (question.wordId !== currentQuestionId) {
    setCurrentQuestionId(question.wordId);
    setSelectedOption(null);
    setIsRevealed(false);
    setIsCorrect(false);
    setIsSubmitting(false);
  }

  // 空欄は1つだけ
  const blank = question.blanks[0];
  const options = blank.options;

  const handleSelectOption = (option: string) => {
    if (isRevealed) return;
    setSelectedOption(option);
  };

  const handleSubmit = () => {
    if (!selectedOption) return;
    const correct = selectedOption === blank.correctAnswer;
    setIsCorrect(correct);
    setIsRevealed(true);
  };

  const handleNext = () => {
    if (isSubmitting) return; // 連打防止
    setIsSubmitting(true);
    onAnswer(isCorrect);
  };

  // 文を空欄で分割して表示
  const renderSentence = () => {
    const parts = question.sentence.split('___');
    return (
      <div className="text-lg font-medium text-[var(--color-foreground)] leading-relaxed text-center">
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < parts.length - 1 && (
              <span
                className={`inline-block min-w-[80px] mx-1 px-3 py-1 rounded-2xl text-center font-semibold ${
                  isRevealed
                    ? isCorrect
                      ? 'bg-[var(--color-success-light)] text-[var(--color-success)] border border-[var(--color-success)]'
                      : 'bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error)]'
                    : selectedOption
                    ? 'bg-[var(--color-primary)] text-white border border-[var(--color-primary-dark)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border border-[var(--color-border)]'
                }`}
              >
                {isRevealed && !isCorrect ? (
                  <span className="flex flex-col items-center text-xs">
                    <span className="line-through">{selectedOption}</span>
                    <span className="text-[var(--color-success)] font-bold">{blank.correctAnswer}</span>
                  </span>
                ) : (
                  selectedOption || '?'
                )}
              </span>
            )}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 日本語訳 - 上部固定 */}
      <div className="flex-shrink-0 mb-4 p-3 bg-[var(--color-warning-light)] rounded-2xl">
        <p className="text-[var(--color-primary-dark)] font-medium text-sm leading-relaxed">{question.japaneseMeaning}</p>
      </div>

      {/* 例文（空欄付き） */}
      <div className="flex-shrink-0 px-2 mb-6">
        {renderSentence()}
      </div>

      {/* 選択肢 - Duolingo風に横並び */}
      <div className="flex-shrink-0 flex flex-wrap justify-center gap-2 mb-6">
        {options.map((option) => {
          const isSelected = selectedOption === option;
          const isCorrectOption = isRevealed && option === blank.correctAnswer;
          const isWrongSelected = isRevealed && isSelected && !isCorrect;

          return (
            <button
              key={option}
              onClick={() => handleSelectOption(option)}
              disabled={isRevealed}
              className={`py-2.5 px-4 rounded-2xl font-medium text-sm transition-all border-2 ${
                isRevealed
                  ? isCorrectOption
                    ? 'bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success)]'
                    : isWrongSelected
                    ? 'bg-[var(--color-error-light)] text-[var(--color-error)] border-[var(--color-error)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)]'
                  : isSelected
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary-dark)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-foreground)] border-[var(--color-border)]'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* ボタン - 選択肢の直下 */}
      <div className="flex-shrink-0">
        {!isRevealed ? (
          <Button
            onClick={handleSubmit}
            disabled={!selectedOption}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] h-12 text-base rounded-2xl"
          >
            回答する
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`flex-1 py-3 rounded-2xl text-center ${
                isCorrect ? 'bg-[var(--color-success-light)]' : 'bg-[var(--color-error-light)]'
              }`}
            >
              <p
                className={`font-bold ${
                  isCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }`}
              >
                {isCorrect ? '正解！' : '不正解'}
              </p>
            </div>
            <Button
              onClick={handleNext}
              className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] h-12 text-base rounded-2xl"
            >
              次へ
            </Button>
          </div>
        )}
      </div>

      {/* 残りのスペースを埋める */}
      <div className="flex-1" />
    </div>
  );
}
