'use client';

import { useState, useCallback } from 'react';
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
  const [draggedOption, setDraggedOption] = useState<string | null>(null);

  // 使用済みの選択肢
  const usedOptions = filledBlanks.filter((b) => b !== null) as string[];

  // ドラッグ開始
  const handleDragStart = (option: string) => {
    setDraggedOption(option);
  };

  // ドラッグ終了
  const handleDragEnd = () => {
    setDraggedOption(null);
  };

  // 空欄にドロップ
  const handleDropOnBlank = (blankIndex: number) => {
    if (!draggedOption || isRevealed) return;

    // もし別の空欄に既にある場合は、そこから外す
    const existingIndex = filledBlanks.indexOf(draggedOption);

    setFilledBlanks((prev) => {
      const newBlanks = [...prev];
      // 既存の場所から削除
      if (existingIndex !== -1) {
        newBlanks[existingIndex] = null;
      }
      // ドロップ先に既に別の単語がある場合は入れ替え
      const currentWord = newBlanks[blankIndex];
      newBlanks[blankIndex] = draggedOption;
      // 入れ替え先が空でなければ、元の場所に移動
      if (currentWord && existingIndex !== -1) {
        newBlanks[existingIndex] = currentWord;
      }
      return newBlanks;
    });
    setDraggedOption(null);
  };

  // 空欄をタップして選択肢を外す
  const handleRemoveFromBlank = (blankIndex: number) => {
    if (isRevealed) return;
    setFilledBlanks((prev) => {
      const newBlanks = [...prev];
      newBlanks[blankIndex] = null;
      return newBlanks;
    });
  };

  // 選択肢をタップして空欄に入れる（モバイル用）
  const handleTapOption = (option: string) => {
    if (isRevealed || usedOptions.includes(option)) return;

    // 最初の空いている空欄に入れる
    const emptyIndex = filledBlanks.findIndex((b) => b === null);
    if (emptyIndex !== -1) {
      setFilledBlanks((prev) => {
        const newBlanks = [...prev];
        newBlanks[emptyIndex] = option;
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
      <div className="text-xl font-medium text-gray-900 leading-relaxed flex flex-wrap items-center justify-center gap-1">
        {parts.map((part, index) => (
          <span key={index} className="flex items-center">
            <span>{part}</span>
            {index < parts.length - 1 && (
              <span
                onClick={() => handleRemoveFromBlank(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropOnBlank(index)}
                className={`inline-flex items-center justify-center min-w-[80px] h-10 mx-1 px-3 rounded-lg text-center font-bold cursor-pointer transition-all ${
                  isRevealed
                    ? filledBlanks[index] === question.blanks[index].correctAnswer
                      ? 'bg-green-100 text-green-700 border-2 border-green-500'
                      : 'bg-red-100 text-red-700 border-2 border-red-500'
                    : filledBlanks[index]
                    ? 'bg-purple-600 text-white border-2 border-purple-600'
                    : 'bg-gray-100 text-gray-400 border-2 border-dashed border-gray-300'
                }`}
              >
                {isRevealed && filledBlanks[index] !== question.blanks[index].correctAnswer ? (
                  <span className="flex flex-col items-center text-sm">
                    <span className="line-through text-red-500">{filledBlanks[index] || '?'}</span>
                    <span className="text-green-600 text-xs">{question.blanks[index].correctAnswer}</span>
                  </span>
                ) : (
                  filledBlanks[index] || `(${index + 1})`
                )}
              </span>
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
      <div className="mb-8 text-center py-4">{renderSentence()}</div>

      {/* 選択肢エリア（すべてフラット） */}
      <div className="flex-1">
        <p className="text-sm text-gray-500 mb-3">単語を空欄にドラッグ、またはタップして配置</p>
        <div className="grid grid-cols-2 gap-2">
          {allOptions.map((option) => {
            const isUsed = usedOptions.includes(option);
            const isDragging = draggedOption === option;

            return (
              <button
                key={option}
                draggable={!isRevealed && !isUsed}
                onDragStart={() => handleDragStart(option)}
                onDragEnd={handleDragEnd}
                onClick={() => handleTapOption(option)}
                disabled={isRevealed}
                className={`py-3 px-4 rounded-xl font-medium transition-all text-center ${
                  isRevealed
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isUsed
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                    : isDragging
                    ? 'bg-purple-200 text-purple-700 border-2 border-purple-500 scale-105'
                    : 'bg-white text-gray-700 border border-gray-200 hover:border-purple-400 hover:bg-purple-50 cursor-grab active:cursor-grabbing'
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
