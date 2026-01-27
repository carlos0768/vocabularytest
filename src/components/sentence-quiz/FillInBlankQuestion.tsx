'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { FillInBlankQuestion as FillInBlankQuestionType } from '@/types';

interface FillInBlankQuestionProps {
  question: FillInBlankQuestionType;
  onAnswer: (isCorrect: boolean) => void;
}

interface DragState {
  isDragging: boolean;
  word: string | null;
  currentX: number;
  currentY: number;
}

export function FillInBlankQuestion({ question, onAnswer }: FillInBlankQuestionProps) {
  // 各空欄に入れた単語（null = 未選択）
  const [filledBlanks, setFilledBlanks] = useState<(string | null)[]>(
    new Array(question.blanks.length).fill(null)
  );

  // すべての選択肢をフラットに（各空欄の正解 + 誤答）
  const [allOptions, setAllOptions] = useState<string[]>(() => {
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

  // タップで選択/解除（フォールバック）
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // 問題が変わったら状態をリセット
  const [currentQuestionId, setCurrentQuestionId] = useState(question.wordId);
  if (question.wordId !== currentQuestionId) {
    setCurrentQuestionId(question.wordId);
    setFilledBlanks(new Array(question.blanks.length).fill(null));
    // 新しい選択肢をシャッフル
    const newOptions: string[] = [];
    question.blanks.forEach((blank) => {
      blank.options.forEach((opt) => {
        if (!newOptions.includes(opt)) {
          newOptions.push(opt);
        }
      });
    });
    setAllOptions(newOptions.sort(() => Math.random() - 0.5));
    setIsRevealed(false);
    setIsCorrect(false);
    setSelectedOption(null);
  }

  // ドラッグ状態
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    word: null,
    currentX: 0,
    currentY: 0,
  });

  // 空欄の参照を保持
  const blankRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 使用済みの選択肢
  const usedOptions = filledBlanks.filter((b) => b !== null) as string[];

  // ドラッグ開始
  const handleTouchStart = (e: React.TouchEvent, option: string) => {
    if (isRevealed) return;
    if (usedOptions.includes(option)) return;
    e.preventDefault();

    const touch = e.touches[0];
    setDragState({
      isDragging: true,
      word: option,
      currentX: touch.clientX,
      currentY: touch.clientY,
    });
  };

  // ドラッグ中
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragState.isDragging) return;
    e.preventDefault();

    const touch = e.touches[0];
    setDragState((prev) => ({
      ...prev,
      currentX: touch.clientX,
      currentY: touch.clientY,
    }));
  };

  // ドラッグ終了
  const handleTouchEnd = () => {
    if (!dragState.isDragging || !dragState.word) {
      setDragState({
        isDragging: false,
        word: null,
        currentX: 0,
        currentY: 0,
      });
      return;
    }

    const x = dragState.currentX;
    const y = dragState.currentY;

    // どの空欄にドロップしたかを判定
    let droppedBlankIndex = -1;
    for (let i = 0; i < blankRefs.current.length; i++) {
      const ref = blankRefs.current[i];
      if (ref) {
        const rect = ref.getBoundingClientRect();
        if (
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        ) {
          droppedBlankIndex = i;
          break;
        }
      }
    }

    if (droppedBlankIndex !== -1) {
      // 空欄に配置
      setFilledBlanks((prev) => {
        const newBlanks = [...prev];
        // 既にこの単語が別の空欄にある場合は外す
        const existingIndex = newBlanks.indexOf(dragState.word!);
        if (existingIndex !== -1) {
          newBlanks[existingIndex] = null;
        }
        // 配置先に別の単語があれば入れ替え
        const currentWord = newBlanks[droppedBlankIndex];
        if (currentWord && existingIndex !== -1) {
          newBlanks[existingIndex] = currentWord;
        }
        newBlanks[droppedBlankIndex] = dragState.word!;
        return newBlanks;
      });
    }

    setDragState({
      isDragging: false,
      word: null,
      currentX: 0,
      currentY: 0,
    });
  };

  const handleTapOption = (option: string) => {
    if (isRevealed) return;
    if (usedOptions.includes(option)) return;

    if (selectedOption === option) {
      setSelectedOption(null);
    } else {
      setSelectedOption(option);
    }
  };

  const handleTapBlank = (blankIndex: number) => {
    if (isRevealed) return;

    const currentWord = filledBlanks[blankIndex];

    if (selectedOption) {
      setFilledBlanks((prev) => {
        const newBlanks = [...prev];
        const existingIndex = newBlanks.indexOf(selectedOption);
        if (existingIndex !== -1) {
          newBlanks[existingIndex] = null;
        }
        if (currentWord && existingIndex !== -1) {
          newBlanks[existingIndex] = currentWord;
        }
        newBlanks[blankIndex] = selectedOption;
        return newBlanks;
      });
      setSelectedOption(null);
    } else if (currentWord) {
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
              <div
                ref={(el) => {
                  blankRefs.current[index] = el;
                }}
                onClick={() => handleTapBlank(index)}
                className={`inline-flex items-center justify-center min-w-[70px] h-9 mx-1 px-2 rounded-lg text-center font-bold transition-all cursor-pointer ${
                  isRevealed
                    ? filledBlanks[index] === question.blanks[index].correctAnswer
                      ? 'bg-green-100 text-green-700 border-2 border-green-500'
                      : 'bg-red-100 text-red-700 border-2 border-red-500'
                    : filledBlanks[index]
                    ? 'bg-purple-600 text-white border-2 border-purple-600 active:bg-purple-700'
                    : dragState.isDragging || selectedOption
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
              </div>
            )}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full"
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ドラッグ中のゴースト要素 */}
      {dragState.isDragging && dragState.word && (
        <div
          className="fixed pointer-events-none z-50 px-4 py-3 rounded-xl font-medium bg-purple-600 text-white shadow-2xl opacity-90 transform -translate-x-1/2 -translate-y-1/2"
          style={{
            left: dragState.currentX,
            top: dragState.currentY,
          }}
        >
          {dragState.word}
        </div>
      )}

      {/* スクロール可能なコンテンツエリア */}
      <div className="flex-1 overflow-y-auto pb-4">
        {/* 日本語訳 */}
        <div className="mb-4 p-3 bg-purple-50 rounded-xl">
          <p className="text-purple-800 font-medium">{question.japaneseMeaning}</p>
        </div>

        {/* 例文（空欄付き） */}
        <div className="mb-6 text-center py-4">{renderSentence()}</div>

        {/* 操作説明 */}
        <p className="text-sm text-gray-500 mb-3 text-center">
          {dragState.isDragging
            ? '空欄にドロップしてください'
            : selectedOption
            ? `「${selectedOption}」を入れる空欄をタップ`
            : '単語をドラッグ or タップして空欄に配置'}
        </p>

        {/* 選択肢エリア */}
        <div className="grid grid-cols-2 gap-2">
          {allOptions.map((option) => {
            const isUsed = usedOptions.includes(option);
            const isSelected = selectedOption === option;
            const isBeingDragged = dragState.isDragging && dragState.word === option;

            return (
              <div
                key={option}
                onTouchStart={(e) => handleTouchStart(e, option)}
                onClick={() => !dragState.isDragging && handleTapOption(option)}
                className={`py-3 px-4 rounded-xl font-medium transition-all text-center select-none cursor-grab active:cursor-grabbing ${
                  isBeingDragged
                    ? 'opacity-30'
                    : isRevealed
                    ? 'bg-gray-100 text-gray-400'
                    : isUsed
                    ? 'bg-gray-200 text-gray-400 opacity-50'
                    : isSelected
                    ? 'bg-purple-600 text-white border-2 border-purple-600 scale-105 shadow-lg'
                    : 'bg-white text-gray-700 border border-gray-200 active:bg-purple-50 active:border-purple-400'
                }`}
              >
                {option}
              </div>
            );
          })}
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
            disabled={filledBlanks.some((b) => b === null)}
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
