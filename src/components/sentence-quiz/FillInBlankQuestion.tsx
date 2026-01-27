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

  // 問題が変わったら状態をリセット
  const [currentQuestionId, setCurrentQuestionId] = useState(question.wordId);
  if (question.wordId !== currentQuestionId) {
    setCurrentQuestionId(question.wordId);
    setSelectedOption(null);
    setIsRevealed(false);
    setIsCorrect(false);
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
    onAnswer(isCorrect);
  };

  // 文を空欄で分割して表示
  const renderSentence = () => {
    const parts = question.sentence.split('___');
    return (
      <div className="text-lg font-medium text-gray-900 leading-relaxed text-center">
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < parts.length - 1 && (
              <span
                className={`inline-block min-w-[80px] mx-1 px-3 py-1 rounded-2xl text-center font-semibold ${
                  isRevealed
                    ? isCorrect
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                    : selectedOption
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isRevealed && !isCorrect ? (
                  <span className="flex flex-col items-center text-xs">
                    <span className="line-through">{selectedOption}</span>
                    <span className="text-green-600 font-bold">{blank.correctAnswer}</span>
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
      <div className="flex-shrink-0 mb-4 p-3 bg-purple-50 rounded-2xl">
        <p className="text-purple-700 font-medium text-sm leading-relaxed">{question.japaneseMeaning}</p>
      </div>

      {/* 例文（空欄付き） */}
      <div className="flex-shrink-0 px-2 mb-6">
        {renderSentence()}
      </div>

      {/* 選択肢 - Duolingo風に横並び */}
      <div className="flex-shrink-0 flex flex-wrap justify-center gap-2 mb-4">
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
                    ? 'bg-green-100 text-green-700 border-green-400'
                    : isWrongSelected
                    ? 'bg-red-100 text-red-700 border-red-400'
                    : 'bg-white text-gray-400 border-gray-200'
                  : isSelected
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* スペーサー */}
      <div className="flex-1 min-h-0" />

      {/* ボタン - 下部固定 */}
      <div className="flex-shrink-0 pb-1">
        {!isRevealed ? (
          <Button
            onClick={handleSubmit}
            disabled={!selectedOption}
            className="w-full bg-purple-600 hover:bg-purple-700 h-12 text-base rounded-2xl"
          >
            回答する
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`flex-1 py-3 rounded-2xl text-center ${
                isCorrect ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              <p
                className={`font-bold ${
                  isCorrect ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {isCorrect ? '正解！' : '不正解'}
              </p>
            </div>
            <Button
              onClick={handleNext}
              className="flex-1 bg-purple-600 hover:bg-purple-700 h-12 text-base rounded-2xl"
            >
              次へ
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
