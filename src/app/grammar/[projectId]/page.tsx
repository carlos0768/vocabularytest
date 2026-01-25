'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookText,
  ChevronRight,
  Check,
  Play,
  Trash2,
} from 'lucide-react';
import type { AIGrammarExtraction } from '@/types';

export default function GrammarQuizPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  // State
  const [patterns, setPatterns] = useState<AIGrammarExtraction[]>([]);
  const [loading, setLoading] = useState(true);

  // Quiz state
  const [quizMode, setQuizMode] = useState(false);
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Load patterns from sessionStorage
  useEffect(() => {
    try {
      const data = sessionStorage.getItem(`grammar_patterns_${projectId}`);
      if (data) {
        setPatterns(JSON.parse(data));
      }
    } catch (error) {
      console.error('Failed to load patterns:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Clear all patterns
  const handleClearAll = () => {
    sessionStorage.removeItem(`grammar_patterns_${projectId}`);
    setPatterns([]);
  };

  // Get all quiz questions flattened
  const allQuestions = patterns.flatMap((pattern, patternIndex) =>
    (pattern.quizQuestions || []).map((q, questionIndex) => ({
      ...q,
      patternName: pattern.patternName,
      patternIndex,
      questionIndex,
    }))
  );

  const totalQuestions = allQuestions.length;
  const currentQuestionNumber = currentPatternIndex * 10 + currentQuestionIndex + 1; // Approximation

  // Quiz handlers
  const currentPattern = patterns[currentPatternIndex];
  const currentQuestion = currentPattern?.quizQuestions?.[currentQuestionIndex];

  const handleStartQuiz = () => {
    setCurrentPatternIndex(0);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowAnswer(false);
    setQuizMode(true);
  };

  const handleSelectAnswer = (answer: string) => {
    if (showAnswer) return;
    setSelectedAnswer(answer);
    setShowAnswer(true);
  };

  const handleNextQuestion = () => {
    const pattern = patterns[currentPatternIndex];
    if (currentQuestionIndex + 1 < (pattern?.quizQuestions?.length || 0)) {
      // Next question in same pattern
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowAnswer(false);
    } else if (currentPatternIndex + 1 < patterns.length) {
      // Next pattern
      setCurrentPatternIndex(prev => prev + 1);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setShowAnswer(false);
    } else {
      // Quiz complete
      setQuizMode(false);
      setCurrentPatternIndex(0);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setShowAnswer(false);
    }
  };

  // Calculate current question number across all patterns
  const getCurrentQuestionNumber = () => {
    let count = 0;
    for (let i = 0; i < currentPatternIndex; i++) {
      count += patterns[i]?.quizQuestions?.length || 0;
    }
    return count + currentQuestionIndex + 1;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Quiz mode render
  if (quizMode && currentQuestion) {
    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Header */}
        <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuizMode(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="font-semibold text-gray-900">{currentPattern.patternName}</h1>
                <p className="text-sm text-gray-500">
                  問題 {getCurrentQuestionNumber()} / {totalQuestions}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Quiz content */}
        <main className="flex-1 max-w-lg mx-auto px-4 py-6 w-full">
          {/* Question */}
          <div className="mb-6">
            <p className="text-lg font-medium text-gray-900 mb-2">
              {currentQuestion.question}
            </p>
            {currentQuestion.questionJa && (
              <p className="text-sm text-gray-500">{currentQuestion.questionJa}</p>
            )}
          </div>

          {/* Options */}
          {currentQuestion.questionType === 'choice' && currentQuestion.options ? (
            <div className="space-y-3 mb-6">
              {currentQuestion.options.map((option, index) => {
                let bgColor = 'bg-white hover:bg-gray-50';
                let borderColor = 'border-gray-200';
                let textColor = 'text-gray-900';

                if (showAnswer) {
                  if (option === currentQuestion.correctAnswer) {
                    bgColor = 'bg-emerald-50';
                    borderColor = 'border-emerald-300';
                    textColor = 'text-emerald-800';
                  } else if (option === selectedAnswer && !isCorrect) {
                    bgColor = 'bg-red-50';
                    borderColor = 'border-red-300';
                    textColor = 'text-red-800';
                  } else {
                    bgColor = 'bg-gray-50';
                    textColor = 'text-gray-400';
                  }
                }

                return (
                  <button
                    key={index}
                    onClick={() => handleSelectAnswer(option)}
                    disabled={showAnswer}
                    className={`w-full p-4 rounded-xl border-2 ${borderColor} ${bgColor} ${textColor} text-left transition-all disabled:cursor-default`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mb-6">
              <input
                type="text"
                value={selectedAnswer || ''}
                onChange={e => setSelectedAnswer(e.target.value)}
                disabled={showAnswer}
                placeholder="答えを入力..."
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
              />
              {!showAnswer && (
                <button
                  onClick={() => setShowAnswer(true)}
                  disabled={!selectedAnswer}
                  className="mt-3 w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  回答する
                </button>
              )}
            </div>
          )}

          {/* Answer feedback */}
          {showAnswer && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${isCorrect ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <p className={`font-medium ${isCorrect ? 'text-emerald-800' : 'text-red-800'}`}>
                  {isCorrect ? '正解!' : '不正解'}
                </p>
                {!isCorrect && (
                  <p className="text-sm text-gray-600 mt-1">
                    正解: {currentQuestion.correctAnswer}
                  </p>
                )}
              </div>

              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-800">{currentQuestion.explanation}</p>
              </div>

              <button
                onClick={handleNextQuestion}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                {getCurrentQuestionNumber() < totalQuestions ? (
                  <>
                    次へ
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    完了
                  </>
                )}
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <h1 className="font-semibold text-gray-900">文法クイズ</h1>
            </div>
            {patterns.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-2 hover:bg-red-50 rounded-full transition-colors"
              >
                <Trash2 className="w-5 h-5 text-gray-400 hover:text-red-500" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto px-4 py-6 w-full">
        {/* Empty state */}
        {patterns.length === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookText className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              文法問題がありません
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              ホーム画面の＋ボタンから<br />
              「文法をスキャン」で問題を追加しましょう
            </p>
          </div>
        )}

        {/* Has patterns - show quiz start */}
        {patterns.length > 0 && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <BookText className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                文法クイズ
              </h2>
              <p className="text-gray-500 text-sm">
                {patterns.length}つの文法パターン・{totalQuestions}問
              </p>
            </div>

            {/* Pattern list */}
            <div className="space-y-3">
              {patterns.map((pattern, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl"
                >
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <BookText className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{pattern.patternName}</p>
                    <p className="text-sm text-gray-500">
                      {pattern.quizQuestions?.length || 0}問
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Start quiz button */}
            <button
              onClick={handleStartQuiz}
              disabled={totalQuestions === 0}
              className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Play className="w-5 h-5" />
              クイズを開始
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
