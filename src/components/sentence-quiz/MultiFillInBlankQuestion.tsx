'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { MultiFillInBlankQuestion as MultiFillInBlankQuestionType, EnhancedBlankSlot } from '@/types';

interface MultiFillInBlankQuestionProps {
  question: MultiFillInBlankQuestionType;
  onAnswer: (isCorrect: boolean) => void;
}

export function MultiFillInBlankQuestion({ question, onAnswer }: MultiFillInBlankQuestionProps) {
  // 各空欄の選択状態
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string | null>>({});
  // 現在アクティブな空欄のインデックス
  const [currentBlankIndex, setCurrentBlankIndex] = useState(0);
  // 回答が表示されたかどうか
  const [isRevealed, setIsRevealed] = useState(false);
  // 全体の正解/不正解
  const [isCorrect, setIsCorrect] = useState(false);
  // 各空欄の正解/不正解状態
  const [blankResults, setBlankResults] = useState<Record<number, boolean>>({});

  // 問題が変わったら状態をリセット
  const [currentQuestionId, setCurrentQuestionId] = useState(question.wordId);
  useEffect(() => {
    if (question.wordId !== currentQuestionId) {
      setCurrentQuestionId(question.wordId);
      setSelectedOptions({});
      setCurrentBlankIndex(0);
      setIsRevealed(false);
      setIsCorrect(false);
      setBlankResults({});
    }
  }, [question.wordId, currentQuestionId]);

  const blanks = question.blanks;

  // 全ての空欄の選択肢をまとめて、シャッフルした状態で保持
  const allOptions = useMemo(() => {
    const options = blanks.flatMap(blank => blank.options);
    // 重複を削除
    const uniqueOptions = [...new Set(options)];
    // シャッフル
    return uniqueOptions.sort(() => Math.random() - 0.5);
  }, [blanks]);

  // 全ての空欄が埋まっているかチェック
  const allBlanksFilled = blanks.every((_, idx) => selectedOptions[idx] !== null && selectedOptions[idx] !== undefined);

  // 既に使われている選択肢を取得
  const usedOptions = useMemo(() => {
    return new Set(Object.values(selectedOptions).filter(Boolean));
  }, [selectedOptions]);

  const handleSelectOption = (option: string) => {
    if (isRevealed) return;
    if (usedOptions.has(option)) return; // 既に使用済みの選択肢は選べない

    setSelectedOptions(prev => ({
      ...prev,
      [currentBlankIndex]: option,
    }));

    // 自動的に次の未入力の空欄に移動
    const nextEmptyIndex = blanks.findIndex((_, idx) =>
      idx > currentBlankIndex && selectedOptions[idx] === undefined
    );
    if (nextEmptyIndex !== -1) {
      setTimeout(() => {
        setCurrentBlankIndex(nextEmptyIndex);
      }, 300);
    } else {
      // 前方に未入力の空欄があるか確認
      const prevEmptyIndex = blanks.findIndex((_, idx) =>
        idx < currentBlankIndex && selectedOptions[idx] === undefined
      );
      if (prevEmptyIndex !== -1) {
        setTimeout(() => {
          setCurrentBlankIndex(prevEmptyIndex);
        }, 300);
      }
    }
  };

  const handleSubmit = () => {
    if (!allBlanksFilled) return;

    // 各空欄の正解/不正解を計算
    const results: Record<number, boolean> = {};
    let allCorrect = true;

    blanks.forEach((blank, idx) => {
      const isBlankCorrect = selectedOptions[idx] === blank.correctAnswer;
      results[idx] = isBlankCorrect;
      if (!isBlankCorrect) allCorrect = false;
    });

    setBlankResults(results);
    setIsCorrect(allCorrect);
    setIsRevealed(true);
  };

  const handleNext = () => {
    onAnswer(isCorrect);
  };

  // 空欄をクリックしてアクティブにする、または選択を解除する
  const handleBlankClick = (index: number) => {
    if (isRevealed) return;

    // 既に選択されている空欄をクリックした場合は選択を解除
    if (selectedOptions[index] !== null && selectedOptions[index] !== undefined) {
      setSelectedOptions(prev => {
        const newOptions = { ...prev };
        delete newOptions[index];
        return newOptions;
      });
    }

    // その空欄をアクティブにする
    setCurrentBlankIndex(index);
  };

  // 文を空欄で分割して表示
  const renderSentence = () => {
    const parts = question.sentence.split('___');
    return (
      <div className="text-lg font-medium text-gray-900 leading-relaxed text-center flex flex-wrap justify-center items-center gap-1">
        {parts.map((part, index) => (
          <span key={index} className="flex items-center">
            <span>{part}</span>
            {index < blanks.length && (
              <BlankDisplay
                blank={blanks[index]}
                blankIndex={index}
                selectedOption={selectedOptions[index] || null}
                isActive={currentBlankIndex === index && !isRevealed}
                isRevealed={isRevealed}
                isCorrect={blankResults[index]}
                onClick={() => handleBlankClick(index)}
              />
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
      <div className="flex-shrink-0 px-2 mb-4">
        {renderSentence()}
      </div>

      {/* VectorDBマッチした単語のヒント表示 */}
      {question.relatedWordIds.length > 0 && !isRevealed && (
        <div className="flex-shrink-0 mb-4 px-2">
          <p className="text-xs text-gray-500 text-center">
            他のプロジェクトで学習した単語も含まれています
          </p>
        </div>
      )}

      {/* 選択中の空欄表示 */}
      {!isRevealed && (
        <div className="flex-shrink-0 mb-2 px-2">
          <p className="text-xs text-gray-500 text-center">
            空欄 {currentBlankIndex + 1} を選択中（タップして別の空欄を選択）
          </p>
        </div>
      )}

      {/* 選択肢 - 全ての選択肢を表示（バランスよく配置） */}
      <div className="flex-shrink-0 flex flex-col items-center gap-2 mb-6">
        {(() => {
          // バランスよく行に分割
          const total = allOptions.length;
          const rows: string[][] = [];

          if (total <= 6) {
            // 6個以下なら1行
            rows.push(allOptions);
          } else if (total <= 12) {
            // 7-12個なら2行でバランスよく分割（各行最大6個）
            const firstRowCount = Math.ceil(total / 2);
            rows.push(allOptions.slice(0, firstRowCount));
            rows.push(allOptions.slice(firstRowCount));
          } else {
            // 11個以上なら5個ずつ、最後の2行はバランス調整
            const itemsPerRow = 5;
            for (let i = 0; i < total; i += itemsPerRow) {
              rows.push(allOptions.slice(i, i + itemsPerRow));
            }
            // 最後の行が3個以下で、前の行がある場合はバランス調整
            if (rows.length >= 2 && rows[rows.length - 1].length <= 3) {
              const lastRow = rows.pop()!;
              const secondLastRow = rows.pop()!;
              const combined = [...secondLastRow, ...lastRow];
              const half = Math.ceil(combined.length / 2);
              rows.push(combined.slice(0, half));
              rows.push(combined.slice(half));
            }
          }

          return rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex flex-wrap justify-center gap-2">
              {row.map((option) => {
                const isUsed = usedOptions.has(option);
                const isSelectedForCurrent = selectedOptions[currentBlankIndex] === option;

                // 回答後: この選択肢がどこかの正解かどうか
                const isCorrectAnswer = isRevealed && blanks.some(b => b.correctAnswer === option);
                // 回答後: この選択肢が間違った場所に使われたか
                const isWronglyUsed = isRevealed && isUsed && blanks.some((b, idx) =>
                  selectedOptions[idx] === option && b.correctAnswer !== option
                );

                return (
                  <button
                    key={option}
                    onClick={() => handleSelectOption(option)}
                    disabled={isRevealed || (isUsed && !isSelectedForCurrent)}
                    className={`py-2.5 px-4 rounded-2xl font-medium text-sm transition-all border-2 ${
                      isRevealed
                        ? isCorrectAnswer
                          ? 'bg-green-100 text-green-700 border-green-400'
                          : isWronglyUsed
                          ? 'bg-red-100 text-red-700 border-red-400'
                          : 'bg-white text-gray-400 border-gray-200'
                        : isUsed
                        ? 'bg-gray-200 text-gray-400 border-gray-200 opacity-50'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ));
        })()}
      </div>

      {/* ボタン */}
      <div className="flex-shrink-0">
        {!isRevealed ? (
          <Button
            onClick={handleSubmit}
            disabled={!allBlanksFilled}
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
                {isCorrect ? '正解！' : `${Object.values(blankResults).filter(Boolean).length}/${blanks.length}正解`}
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

      {/* 残りのスペースを埋める */}
      <div className="flex-1" />
    </div>
  );
}

// 空欄表示コンポーネント
interface BlankDisplayProps {
  blank: EnhancedBlankSlot;
  blankIndex: number;
  selectedOption: string | null;
  isActive: boolean;
  isRevealed: boolean;
  isCorrect: boolean | undefined;
  onClick: () => void;
}

function BlankDisplay({
  blank,
  selectedOption,
  isActive,
  isRevealed,
  isCorrect,
  onClick,
}: BlankDisplayProps) {
  // ソースに応じたバッジ色
  const getSourceBadgeColor = () => {
    switch (blank.source) {
      case 'target':
        return 'bg-purple-200 text-purple-800';
      case 'vector-matched':
        return 'bg-blue-200 text-blue-800';
      case 'grammar':
        return 'bg-gray-200 text-gray-800';
      default:
        return 'bg-gray-200 text-gray-600';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex flex-col items-center min-w-[80px] mx-1 px-3 py-1 rounded-2xl text-center font-semibold transition-all ${
        isRevealed
          ? isCorrect
            ? 'bg-green-100 text-green-700 border-2 border-green-400'
            : 'bg-red-100 text-red-700 border-2 border-red-400'
          : isActive
          ? 'bg-purple-100 text-purple-700 border-2 border-purple-400'
          : selectedOption
          ? 'bg-purple-600 text-white border-2 border-purple-600'
          : 'bg-gray-100 text-gray-400 border-2 border-gray-200'
      }`}
    >
      {isRevealed && !isCorrect ? (
        <span className="flex flex-col items-center text-xs">
          <span className="line-through">{selectedOption}</span>
          <span className="text-green-600 font-bold">{blank.correctAnswer}</span>
        </span>
      ) : (
        <span className="text-sm">{selectedOption || '?'}</span>
      )}

      {/* ソースバッジ（VectorDBマッチの場合のみ表示） */}
      {isRevealed && blank.source === 'vector-matched' && (
        <span className={`text-xs mt-0.5 px-1.5 py-0.5 rounded-full ${getSourceBadgeColor()}`}>
          復習
        </span>
      )}
    </button>
  );
}
