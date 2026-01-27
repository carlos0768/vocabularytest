'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FillInBlankQuestion as FillInBlankQuestionType } from '@/types';

interface FillInBlankQuestionProps {
  question: FillInBlankQuestionType;
  onAnswer: (isCorrect: boolean) => void;
}

export function FillInBlankQuestion({ question, onAnswer }: FillInBlankQuestionProps) {
  // 各空欄に入れた単語（null = 未選択）
  const [filledBlanks, setFilledBlanks] = useState<(string | null)[]>(
    new Array(question.blanks.length).fill(null)
  );

  // すべての選択肢をフラットに（各空欄の正解 + 誤答）
  const [allOptions] = useState<string[]>(() => {
    const options: string[] = [];
    question.blanks.forEach((blank) => {
      blank.options.forEach((opt) => {
        if (!options.includes(opt)) {
          options.push(opt);
        }
      });
    });
    // シャッフル
    return options.sort(() => Math.random() - 0.5);
  });

  const [isRevealed, setIsRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // 選択中の単語（タップで選択→空欄タップで配置）
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // 使用済みの選択肢
  const usedOptions = filledBlanks.filter((b) => b !== null) as string[];

  // 選択肢をタップ
  const handleTapOption = (option: string) => {
    if (isRevealed) return;

    // 既に使用済みなら何もしない
    if (usedOptions.includes(option)) return;

    // 同じものをタップしたら選択解除
    if (selectedOption === option) {
      setSelectedOption(null);
    } else {
      setSelectedOption(option);
    }
  };

  // 空欄をタップ
  const handleTapBlank = (blankIndex: number) => {
    if (isRevealed) return;

    const currentWord = filledBlanks[blankIndex];

    // 選択中の単語がある場合 → その空欄に配置
    if (selectedOption) {
      setFilledBlanks((prev) => {
        const newBlanks = [...prev];
        // 既にこの単語が別の空欄にある場合は外す
        const existingIndex = newBlanks.indexOf(selectedOption);
        if (existingIndex !== -1) {
          newBlanks[existingIndex] = null;
        }
        // 配置先に別の単語があれば入れ替え
        if (currentWord && existingIndex !== -1) {
          newBlanks[existingIndex] = currentWord;
        }
        newBlanks[blankIndex] = selectedOption;
        return newBlanks;
      });
      setSelectedOption(null);
    } else if (currentWord) {
      // 選択中の単語がない & 空欄に単語がある → 外す
      setFilledBlanks((prev) => {
        const newBlanks = [...prev];
        newBlanks[blankIndex] = null;
        return newBlanks;
      });
    }
  };

  const handleSubmit = () => {
    if (filledBlanks.some((b) => b === null)) return;

    const allCorrect = question.blanks.every(
      (blank, index) => filledBlanks[index] === blank.correctAnswer
    );
    setIsCorrect(allCorrect);
    setIsRevealed(true);
  };

  const handleNext = () => {
    onAnswer(isCorrect);
  };

  // 文を空欄で分割して表示
  const renderSentence = () => {
    const parts = question.sentence.split('___');
    return (
      <div className="text-lg font-medium text-gray-900 leading-relaxed flex flex-wrap items-center justify-center gap-1">
        {parts.map((part, index) => (
          <span key={index} className="flex items-center">
            <span>{part}</span>
            {index < parts.length - 1 && (
              <button
                onClick={() => handleTapBlank(index)}
                disabled={isRevealed}
                className={`inline-flex items-center justify-center min-w-[70px] h-9 mx-1 px-2 rounded-lg text-center font-bold transition-all ${
                  isRevealed
                    ? filledBlanks[index] === question.blanks[index].correctAnswer
                      ? 'bg-green-100 text-green-700 border-2 border-green-500'
                      : 'bg-red-100 text-red-700 border-2 border-red-500'
                    : filledBlanks[index]
                    ? 'bg-purple-600 text-white border-2 border-purple-600 active:bg-purple-700'
                    : selectedOption
                    ? 'bg-purple-100 text-purple-600 border-2 border-dashed border-purple-400 animate-pulse'
                    : 'bg-gray-100 text-gray-400 border-2 border-dashed border-gray-300'
                }`}
              >
                {isRevealed && filledBlanks[index] !== question.blanks[index].correctAnswer ? (
                  <span className="flex flex-col items-center text-xs">
                    <span className="line-through text-red-500">{filledBlanks[index] || '?'}</span>
                    <span className="text-green-600">{question.blanks[index].correctAnswer}</span>
                  </span>
                ) : (
                  <span className="text-sm">{filledBlanks[index] || `(${index + 1})`}</span>
                )}
              </button>
            )}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 日本語訳 */}
      <div className="mb-4 p-3 bg-purple-50 rounded-xl">
        <p className="text-purple-800 font-medium">{question.japaneseMeaning}</p>
      </div>

      {/* 例文（空欄付き） */}
      <div className="mb-6 text-center py-4">{renderSentence()}</div>

      {/* 操作説明 */}
      <p className="text-sm text-gray-500 mb-3 text-center">
        {selectedOption
          ? `「${selectedOption}」を入れる空欄をタップ`
          : '単語を選んで空欄に配置'}
      </p>

      {/* 選択肢エリア */}
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-2">
          {allOptions.map((option) => {
            const isUsed = usedOptions.includes(option);
            const isSelected = selectedOption === option;

            return (
              <button
                key={option}
                onClick={() => handleTapOption(option)}
                disabled={isRevealed}
                className={`py-3 px-4 rounded-xl font-medium transition-all text-center ${
                  isRevealed
                    ? 'bg-gray-100 text-gray-400'
                    : isUsed
                    ? 'bg-gray-200 text-gray-400 opacity-50'
                    : isSelected
                    ? 'bg-purple-600 text-white border-2 border-purple-600 scale-105 shadow-lg'
                    : 'bg-white text-gray-700 border border-gray-200 active:bg-purple-50 active:border-purple-400'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {/* 回答/次へボタン */}
      <div className="mt-6">
        {!isRevealed ? (
          <Button
            onClick={handleSubmit}
            disabled={filledBlanks.some((b) => b === null)}
            className="w-full bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            回答する
          </Button>
        ) : (
          <div className="space-y-3">
            {/* 結果表示 */}
            <div
              className={`p-4 rounded-xl text-center ${
                isCorrect ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              <p
                className={`font-bold text-lg ${
                  isCorrect ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {isCorrect ? '正解！' : '不正解...'}
              </p>
            </div>
            <Button
              onClick={handleNext}
              className="w-full bg-purple-600 hover:bg-purple-700"
              size="lg"
            >
              次へ
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
