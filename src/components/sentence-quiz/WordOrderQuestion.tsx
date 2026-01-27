'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WordOrderQuestion as WordOrderQuestionType } from '@/types';

interface WordOrderQuestionProps {
  question: WordOrderQuestionType;
  onAnswer: (isCorrect: boolean) => void;
}

export function WordOrderQuestion({ question, onAnswer }: WordOrderQuestionProps) {
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [remainingWords, setRemainingWords] = useState<string[]>(question.shuffledWords);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSelectWord = (word: string, index: number) => {
    if (isRevealed) return;
    setSelectedWords((prev) => [...prev, word]);
    setRemainingWords((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveWord = (index: number) => {
    if (isRevealed) return;
    const word = selectedWords[index];
    setSelectedWords((prev) => prev.filter((_, i) => i !== index));
    setRemainingWords((prev) => [...prev, word]);
  };

  const handleReset = () => {
    if (isRevealed) return;
    setSelectedWords([]);
    setRemainingWords(question.shuffledWords);
  };

  const handleSubmit = () => {
    if (selectedWords.length !== question.correctOrder.length) return;

    const allCorrect = selectedWords.every(
      (word, index) => word === question.correctOrder[index]
    );
    setIsCorrect(allCorrect);
    setIsRevealed(true);
  };

  const handleNext = () => {
    onAnswer(isCorrect);
  };

  return (
    <div className="flex flex-col h-full">
      {/* スクロール可能なコンテンツエリア */}
      <div className="flex-1 overflow-y-auto pb-4">
        {/* 日本語訳（ヒント） */}
        <div className="mb-4 p-3 bg-purple-50 rounded-xl">
          <p className="text-sm text-purple-600 mb-1">この文を英語で並べてください</p>
          <p className="text-purple-800 font-medium text-lg">{question.japaneseMeaning}</p>
        </div>

        {/* 選択した単語（回答エリア） */}
        <div className="mb-6">
          <div
            className={`min-h-[80px] p-4 rounded-xl border-2 border-dashed ${
              isRevealed
                ? isCorrect
                  ? 'border-green-500 bg-green-50'
                  : 'border-red-500 bg-red-50'
                : 'border-gray-300 bg-gray-50'
            }`}
          >
            {selectedWords.length === 0 ? (
              <p className="text-gray-400 text-center">タップして単語を選択</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedWords.map((word, index) => {
                  const isWordCorrect = isRevealed && word === question.correctOrder[index];
                  const isWordIncorrect = isRevealed && word !== question.correctOrder[index];

                  return (
                    <button
                      key={`selected-${index}`}
                      onClick={() => handleRemoveWord(index)}
                      disabled={isRevealed}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        isWordCorrect
                          ? 'bg-green-500 text-white'
                          : isWordIncorrect
                          ? 'bg-red-500 text-white'
                          : 'bg-purple-600 text-white active:bg-purple-700'
                      }`}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 正解を表示（不正解時） */}
          {isRevealed && !isCorrect && (
            <div className="mt-3 p-3 bg-green-50 rounded-xl">
              <p className="text-sm text-green-600 mb-1">正解</p>
              <p className="text-green-800 font-medium">{question.correctOrder.join(' ')}</p>
            </div>
          )}
        </div>

        {/* 残りの単語 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500">単語を選択</p>
            {!isRevealed && selectedWords.length > 0 && (
              <button
                onClick={handleReset}
                className="text-sm text-purple-600 flex items-center gap-1 active:text-purple-700"
              >
                <RotateCcw className="w-4 h-4" />
                リセット
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {remainingWords.map((word, index) => (
              <button
                key={`remaining-${index}`}
                onClick={() => handleSelectWord(word, index)}
                disabled={isRevealed}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  isRevealed
                    ? 'bg-gray-200 text-gray-400'
                    : 'bg-white border border-gray-300 text-gray-700 active:border-purple-500 active:bg-purple-50'
                }`}
              >
                {word}
              </button>
            ))}
          </div>
        </div>

        {/* 結果表示（回答後） */}
        {isRevealed && (
          <div
            className={`mt-4 p-4 rounded-xl text-center ${
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
        )}
      </div>

      {/* 固定ボタンエリア */}
      <div className="flex-shrink-0 pt-4">
        {!isRevealed ? (
          <Button
            onClick={handleSubmit}
            disabled={selectedWords.length !== question.correctOrder.length}
            className="w-full bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            回答する
          </Button>
        ) : (
          <Button
            onClick={handleNext}
            className="w-full bg-purple-600 hover:bg-purple-700"
            size="lg"
          >
            次へ
          </Button>
        )}
      </div>
    </div>
  );
}
