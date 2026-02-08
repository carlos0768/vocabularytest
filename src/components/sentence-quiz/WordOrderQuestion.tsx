'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 問題が変わったら状態をリセット
  const [currentQuestionId, setCurrentQuestionId] = useState(question.wordId);
  if (question.wordId !== currentQuestionId) {
    setCurrentQuestionId(question.wordId);
    setSelectedWords([]);
    setRemainingWords(question.shuffledWords);
    setIsRevealed(false);
    setIsCorrect(false);
    setIsSubmitting(false);
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
    if (isSubmitting) return; // 連打防止
    setIsSubmitting(true);
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
          className="fixed pointer-events-none z-50 px-4 py-2 rounded-lg font-medium bg-[var(--color-primary)] text-white shadow-2xl opacity-90 transform -translate-x-1/2 -translate-y-1/2"
          style={{
            left: dragState.currentX,
            top: dragState.currentY,
          }}
        >
          {dragState.word}
        </div>
      )}

      {/* コンテンツエリア */}
      <div className="flex-1 flex flex-col overflow-auto min-h-0">
        {/* 日本語訳（ヒント） */}
        <div className="mb-1 p-2 bg-[var(--color-primary-light)] rounded-xl">
          <p className="text-[var(--color-primary-dark)] font-medium text-xs">{question.japaneseMeaning}</p>
        </div>

        {/* 選択した単語（回答エリア）- ドロップゾーン */}
        <div className="mb-1">
          <div
            ref={dropZoneRef}
            className={`min-h-[44px] p-2 rounded-xl border-2 border-dashed transition-all ${
              isRevealed
                ? isCorrect
                  ? 'border-[var(--color-success)] bg-[var(--color-success-light)]'
                  : 'border-[var(--color-error)] bg-[var(--color-error-light)]'
                : dragState.isDragging && dragState.sourceType === 'remaining'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                : 'border-[var(--color-border)] bg-[var(--color-background)]'
            }`}
          >
            {selectedWords.length === 0 ? (
              <p className="text-[var(--color-muted)] text-center text-xs py-1">
                {dragState.isDragging ? 'ここにドロップ' : '単語をタップ'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
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
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all select-none cursor-grab active:cursor-grabbing ${
                        isBeingDragged
                          ? 'opacity-30'
                          : isWordCorrect
                          ? 'bg-[var(--color-success)] text-white'
                          : isWordIncorrect
                          ? 'bg-[var(--color-error)] text-white'
                          : 'bg-[var(--color-primary)] text-white'
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
            <div className="mt-1 p-2 bg-[var(--color-success-light)] rounded-xl">
              <p className="text-[var(--color-success)] text-xs">{question.correctOrder.join(' ')}</p>
            </div>
          )}
        </div>

        {/* 残りの単語 - 単語プール */}
        <div className="flex-1 min-h-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-[var(--color-muted)]">単語を選択</p>
            {!isRevealed && selectedWords.length > 0 && (
              <button
                onClick={handleReset}
                className="text-[10px] text-[var(--color-primary)] flex items-center gap-0.5 active:text-[var(--color-primary-dark)]"
              >
                <Icon name="refresh" size={10} />
                リセット
              </button>
            )}
          </div>
          <div
            ref={wordPoolRef}
            className={`flex flex-wrap gap-1.5 min-h-[40px] p-2 rounded-xl transition-all ${
              dragState.isDragging && dragState.sourceType === 'selected'
                ? 'bg-[var(--color-background)] border-2 border-dashed border-[var(--color-border)]'
                : 'bg-[var(--color-background)]'
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
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all select-none cursor-grab active:cursor-grabbing ${
                    isBeingDragged
                      ? 'opacity-30'
                      : isRevealed
                      ? 'bg-[var(--color-border-light)] text-[var(--color-muted)]'
                      : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-foreground)] active:border-[var(--color-primary)] active:bg-[var(--color-primary-light)]'
                  } ${isRevealed ? '' : 'active:scale-95'}`}
                >
                  {word}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 固定ボタンエリア - 常に下部に表示 */}
      <div className="flex-shrink-0 pt-2 mt-auto bg-[var(--color-background)]">
        {!isRevealed ? (
          <Button
            onClick={handleSubmit}
            disabled={selectedWords.length !== question.correctOrder.length}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] disabled:bg-[var(--color-border)] disabled:text-[var(--color-muted)] h-12 text-base font-bold rounded-xl"
          >
            回答する
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`flex-1 py-3 rounded-xl text-center ${
                isCorrect ? 'bg-[var(--color-success-light)]' : 'bg-[var(--color-error-light)]'
              }`}
            >
              <p
                className={`font-bold text-base ${
                  isCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
                }`}
              >
                {isCorrect ? '正解！' : '不正解'}
              </p>
            </div>
            <Button
              onClick={handleNext}
              className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] h-12 text-base font-bold rounded-xl"
            >
              次へ
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
