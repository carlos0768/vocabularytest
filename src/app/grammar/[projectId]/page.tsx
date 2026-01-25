'use client';

import { useState, useEffect, use, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookText,
  Play,
  Trash2,
} from 'lucide-react';
import type { AIGrammarExtraction, AIGrammarQuizQuestion } from '@/types';
import { normalizeGrammarExtraction } from '@/lib/grammar';
import { GrammarQuizContainer } from '@/components/grammar-quiz';

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
  const [correctCount, setCorrectCount] = useState(0);

  // Load patterns from sessionStorage and normalize to new format
  useEffect(() => {
    try {
      const data = sessionStorage.getItem(`grammar_patterns_${projectId}`);
      if (data) {
        const rawPatterns = JSON.parse(data);
        // Normalize any legacy format patterns to new format
        const normalized = rawPatterns.map(normalizeGrammarExtraction);
        setPatterns(normalized);
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
  const allQuestions = useMemo(() => {
    return patterns.flatMap((pattern, patternIndex) =>
      (pattern.quizQuestions || []).map((q, questionIndex) => ({
        question: q as AIGrammarQuizQuestion,
        patternName: pattern.patternName,
        patternIndex,
        questionIndex,
      }))
    );
  }, [patterns]);

  const totalQuestions = allQuestions.length;

  // Get current question number
  const getCurrentQuestionNumber = () => {
    let count = 0;
    for (let i = 0; i < currentPatternIndex; i++) {
      count += patterns[i]?.quizQuestions?.length || 0;
    }
    return count + currentQuestionIndex + 1;
  };

  // Get current question data
  const currentQuestionData = useMemo(() => {
    const currentPattern = patterns[currentPatternIndex];
    const currentQuestion = currentPattern?.quizQuestions?.[currentQuestionIndex];
    if (!currentQuestion) return null;

    return {
      question: currentQuestion as AIGrammarQuizQuestion,
      patternName: currentPattern.patternName,
    };
  }, [patterns, currentPatternIndex, currentQuestionIndex]);

  // Quiz handlers
  const handleStartQuiz = () => {
    setCurrentPatternIndex(0);
    setCurrentQuestionIndex(0);
    setCorrectCount(0);
    setQuizMode(true);
  };

  const handleAnswer = (isCorrect: boolean) => {
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    const pattern = patterns[currentPatternIndex];
    if (currentQuestionIndex + 1 < (pattern?.quizQuestions?.length || 0)) {
      // Next question in same pattern
      setCurrentQuestionIndex((prev) => prev + 1);
    } else if (currentPatternIndex + 1 < patterns.length) {
      // Next pattern
      setCurrentPatternIndex((prev) => prev + 1);
      setCurrentQuestionIndex(0);
    } else {
      // Quiz complete
      setQuizMode(false);
      setCurrentPatternIndex(0);
      setCurrentQuestionIndex(0);
    }
  };

  const handleExitQuiz = () => {
    setQuizMode(false);
    setCurrentPatternIndex(0);
    setCurrentQuestionIndex(0);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Quiz mode - use new GrammarQuizContainer with Duolingo-style UI
  if (quizMode && currentQuestionData) {
    return (
      <GrammarQuizContainer
        question={currentQuestionData.question}
        patternName={currentQuestionData.patternName}
        currentQuestionNumber={getCurrentQuestionNumber()}
        totalQuestions={totalQuestions}
        onAnswer={handleAnswer}
        onNext={handleNextQuestion}
        onExit={handleExitQuiz}
      />
    );
  }

  // List mode - show patterns and start button
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
