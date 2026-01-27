'use client';

import { useState, useRef, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WordOrderQuestion as WordOrderQuestionType } from '@/types';

interface WordOrderQuestionProps {
  question: WordOrderQuestionType;
  onAnswer: (isCorrect: boolean) => void;
}

interface DragState {
  isDragging: boolean;
  word: string | null;
  sourceIndex: number | null;
  sourceType: 'remaining' | 'selected' | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function WordOrderQuestion({ question, onAnswer }: WordOrderQuestionProps) {
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [remainingWords, setRemainingWords] = useState<string[]>(question.shuffledWords);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // 問題が変わったら状態をリセット
  const [currentQuestionId, setCurrentQuestionId] = useState(question.wordId);
  if (question.wordId !== currentQuestionId) {
    setCurrentQuestionId(question.wordId);
    setSelectedWords([]);
    setRemainingWords(question.shuffledWords);
    setIsRevealed(false);
    setIsCorrect(false);
  }

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    word: null,
    sourceIndex: null,
    sourceType: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const wordPoolRef = useRef<HTMLDivElement>(null);
  const dragGhostRef = useRef<HTMLDivElement>(null);

  // ドラッグ開始（タッチ）
  const handleTouchStart = (
    e: React.TouchEvent,
    word: string,
    index: number,
    sourceType: 'remaining' | 'selected'
  ) => {
    if (isRevealed) return;
    e.preventDefault();

    const touch = e.touches[0];
    setDragState({
      isDragging: true,
      word,
      sourceIndex: index,
      sourceType,
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      currentY: touch.clientY,
    });
  };

  // ドラッグ中（タッチ）
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

  // ドラッグ終了（タッチ）
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!dragState.isDragging || !dragState.word) {
      setDragState({
        isDragging: false,
        word: null,
        sourceIndex: null,
        sourceType: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      });
      return;
    }

    const dropZone = dropZoneRef.current;
    const wordPool = wordPoolRef.current;

    if (dropZone && wordPool) {
      const dropRect = dropZone.getBoundingClientRect();
      const poolRect = wordPool.getBoundingClientRect();

      const x = dragState.currentX;
      const y = dragState.currentY;

      // ドロップゾーン（回答エリア）にドロップ
      if (
        x >= dropRect.left &&
        x <= dropRect.right &&
        y >= dropRect.top &&
        y <= dropRect.bottom
      ) {
        if (dragState.sourceType === 'remaining') {
          // 残り単語から回答エリアへ
          setSelectedWords((prev) => [...prev, dragState.word!]);
          setRemainingWords((prev) => prev.filter((_, i) => i !== dragState.sourceIndex));
        }
        // 既に選択済みの単語はそのまま
      }
      // 単語プール（残り単語エリア）にドロップ
      else if (
        x >= poolRect.left &&
        x <= poolRect.right &&
        y >= poolRect.top &&
        y <= poolRect.bottom
      ) {
        if (dragState.sourceType === 'selected') {
          // 回答エリアから残り単語へ
          setRemainingWords((prev) => [...prev, dragState.word!]);
          setSelectedWords((prev) => prev.filter((_, i) => i !== dragState.sourceIndex));
        }
      }
      // どこでもない場所にドロップ → 元に戻す（何もしない）
    }

    setDragState({
      isDragging: false,
      word: null,
      sourceIndex: null,
      sourceType: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
  };

  // タップで選択/解除（フォールバック）
  const handleTap = (
    word: string,
    index: number,
    sourceType: 'remaining' | 'selected'
  ) => {
    if (isRevealed) return;

    if (sourceType === 'remaining') {
      setSelectedWords((prev) => [...prev, word]);
      setRemainingWords((prev) => prev.filter((_, i) => i !== index));
    } else {
      setRemainingWords((prev) => [...prev, word]);
      setSelectedWords((prev) => prev.filter((_, i) => i !== index));
    }
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
    <div
      className="flex flex-col h-full"
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ドラッグ中のゴースト要素 */}
      {dragState.isDragging && dragState.word && (
        <div
          ref={dragGhostRef}
          className="fixed pointer-events-none z-50 px-4 py-2 rounded-lg font-medium bg-purple-600 text-white shadow-2xl opacity-90 transform -translate-x-1/2 -translate-y-1/2"
          style={{
            left: dragState.currentX,
            top: dragState.currentY,
          }}
        >
          {dragState.word}
        </div>
      )}

      {/* コンテンツエリア（スクロール無効） */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 日本語訳（ヒント） */}
        <div className="mb-2 p-2 bg-purple-50 rounded-lg">
          <p className="text-purple-800 font-medium text-sm">{question.japaneseMeaning}</p>
        </div>

        {/* 選択した単語（回答エリア）- ドロップゾーン */}
        <div className="mb-2">
          <div
            ref={dropZoneRef}
            className={`min-h-[56px] p-2 rounded-lg border-2 border-dashed transition-all ${
              isRevealed
                ? isCorrect
                  ? 'border-green-500 bg-green-50'
                  : 'border-red-500 bg-red-50'
                : dragState.isDragging && dragState.sourceType === 'remaining'
                ? 'border-purple-500 bg-purple-50'
                : 'border-gray-300 bg-gray-50'
            }`}
          >
            {selectedWords.length === 0 ? (
              <p className="text-gray-400 text-center text-sm py-2">
                {dragState.isDragging ? 'ここにドロップ' : '単語をドラッグ or タップ'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedWords.map((word, index) => {
                  const isWordCorrect = isRevealed && word === question.correctOrder[index];
                  const isWordIncorrect = isRevealed && word !== question.correctOrder[index];
                  const isBeingDragged =
                    dragState.isDragging &&
                    dragState.sourceType === 'selected' &&
                    dragState.sourceIndex === index;

                  return (
                    <div
                      key={`selected-${index}`}
                      onTouchStart={(e) => handleTouchStart(e, word, index, 'selected')}
                      onClick={() => !dragState.isDragging && handleTap(word, index, 'selected')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all select-none cursor-grab active:cursor-grabbing ${
                        isBeingDragged
                          ? 'opacity-30'
                          : isWordCorrect
                          ? 'bg-green-500 text-white'
                          : isWordIncorrect
                          ? 'bg-red-500 text-white'
                          : 'bg-purple-600 text-white'
                      } ${isRevealed ? '' : 'active:scale-95'}`}
                    >
                      {word}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 正解を表示（不正解時） */}
          {isRevealed && !isCorrect && (
            <div className="mt-1 p-2 bg-green-50 rounded-lg">
              <p className="text-green-800 text-sm">{question.correctOrder.join(' ')}</p>
            </div>
          )}
        </div>

        {/* 残りの単語 - 単語プール */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">単語を選択</p>
            {!isRevealed && selectedWords.length > 0 && (
              <button
                onClick={handleReset}
                className="text-xs text-purple-600 flex items-center gap-1 active:text-purple-700"
              >
                <RotateCcw className="w-3 h-3" />
                リセット
              </button>
            )}
          </div>
          <div
            ref={wordPoolRef}
            className={`flex flex-wrap gap-1.5 min-h-[44px] p-2 rounded-lg transition-all ${
              dragState.isDragging && dragState.sourceType === 'selected'
                ? 'bg-gray-100 border-2 border-dashed border-gray-300'
                : 'bg-gray-50'
            }`}
          >
            {remainingWords.map((word, index) => {
              const isBeingDragged =
                dragState.isDragging &&
                dragState.sourceType === 'remaining' &&
                dragState.sourceIndex === index;

              return (
                <div
                  key={`remaining-${index}`}
                  onTouchStart={(e) => handleTouchStart(e, word, index, 'remaining')}
                  onClick={() => !dragState.isDragging && handleTap(word, index, 'remaining')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all select-none cursor-grab active:cursor-grabbing ${
                    isBeingDragged
                      ? 'opacity-30'
                      : isRevealed
                      ? 'bg-gray-200 text-gray-400'
                      : 'bg-white border border-gray-300 text-gray-700 active:border-purple-500 active:bg-purple-50'
                  } ${isRevealed ? '' : 'active:scale-95'}`}
                >
                  {word}
                </div>
              );
            })}
            {remainingWords.length === 0 && !dragState.isDragging && (
              <p className="text-gray-400 text-xs">すべて選択済み</p>
            )}
          </div>
        </div>
      </div>

      {/* 固定ボタンエリア */}
      <div className="flex-shrink-0 pt-2">
        {!isRevealed ? (
          <Button
            onClick={handleSubmit}
            disabled={selectedWords.length !== question.correctOrder.length}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            回答する
          </Button>
        ) : (
          <div className="space-y-2">
            <div
              className={`p-2 rounded-lg text-center ${
                isCorrect ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              <p
                className={`font-bold ${
                  isCorrect ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {isCorrect ? '正解！' : '不正解...'}
              </p>
            </div>
            <Button
              onClick={handleNext}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              次へ
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
