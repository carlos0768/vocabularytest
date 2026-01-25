'use client';

/**
 * Grammar Quiz React Hook
 * デュオリンゴ式の文法クイズの状態管理を提供するカスタムフック
 */

import { useState, useCallback, useMemo } from 'react';
import type { AIGrammarQuizQuestion, AIGrammarExtraction } from '@/types';
import {
  type AnswerState,
  type ValidationResult,
  createInitialAnswerState,
  selectWord,
  deselectWord,
  deselectWordAtIndex,
  validateAnswer,
  canSubmitAnswer,
  shuffleArray,
  normalizeGrammarExtraction,
} from './quiz-utils';

// ============ Types ============

export interface QuizProgress {
  currentIndex: number;
  totalCount: number;
  correctCount: number;
  wrongCount: number;
}

export type QuizPhase = 'answering' | 'feedback' | 'completed';

export interface UseGrammarQuizReturn {
  // 現在の状態
  currentQuestion: AIGrammarQuizQuestion | null;
  answerState: AnswerState;
  phase: QuizPhase;
  progress: QuizProgress;
  lastResult: ValidationResult | null;

  // アクション
  selectWord: (word: string) => void;
  deselectWord: (word: string) => void;
  deselectWordAtIndex: (index: number) => void;
  submitAnswer: () => void;
  nextQuestion: () => void;
  resetQuiz: () => void;

  // 便利なゲッター
  canSubmit: boolean;
  isCorrect: boolean | null;
  isCompleted: boolean;
}

// ============ Hook Implementation ============

export function useGrammarQuiz(
  patterns: AIGrammarExtraction[],
  options?: {
    shuffle?: boolean;
    onComplete?: (progress: QuizProgress) => void;
  }
): UseGrammarQuizReturn {
  const { shuffle = true, onComplete } = options || {};

  // 全ての問題を抽出してフラット化
  const allQuestions = useMemo(() => {
    const normalized = patterns.map(normalizeGrammarExtraction);
    const questions = normalized.flatMap((p) => p.quizQuestions);
    return shuffle ? shuffleArray(questions) : questions;
  }, [patterns, shuffle]);

  // 状態
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [phase, setPhase] = useState<QuizPhase>('answering');
  const [lastResult, setLastResult] = useState<ValidationResult | null>(null);

  // 現在の問題
  const currentQuestion = allQuestions[currentIndex] || null;

  // 回答状態
  const [answerState, setAnswerState] = useState<AnswerState>(() =>
    currentQuestion ? createInitialAnswerState(currentQuestion) : { selectedWords: [], availableWords: [] }
  );

  // 単語を選択
  const handleSelectWord = useCallback(
    (word: string) => {
      if (phase !== 'answering') return;
      setAnswerState((prev) => selectWord(prev, word));
    },
    [phase]
  );

  // 単語を選択解除
  const handleDeselectWord = useCallback(
    (word: string) => {
      if (phase !== 'answering') return;
      setAnswerState((prev) => deselectWord(prev, word));
    },
    [phase]
  );

  // インデックスで選択解除
  const handleDeselectWordAtIndex = useCallback(
    (index: number) => {
      if (phase !== 'answering') return;
      setAnswerState((prev) => deselectWordAtIndex(prev, index));
    },
    [phase]
  );

  // 回答を確定
  const handleSubmitAnswer = useCallback(() => {
    if (!currentQuestion || phase !== 'answering') return;

    const result = validateAnswer(currentQuestion, answerState);
    setLastResult(result);

    if (result.isCorrect) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setWrongCount((prev) => prev + 1);
    }

    setPhase('feedback');
  }, [currentQuestion, answerState, phase]);

  // 次の問題へ
  const handleNextQuestion = useCallback(() => {
    if (phase !== 'feedback') return;

    const nextIndex = currentIndex + 1;

    if (nextIndex >= allQuestions.length) {
      setPhase('completed');
      onComplete?.({
        currentIndex: nextIndex,
        totalCount: allQuestions.length,
        correctCount: correctCount + (lastResult?.isCorrect ? 0 : 0), // Already counted
        wrongCount: wrongCount + (lastResult?.isCorrect ? 0 : 0), // Already counted
      });
      return;
    }

    setCurrentIndex(nextIndex);
    setPhase('answering');
    setLastResult(null);

    // 新しい問題の回答状態を初期化
    const nextQuestion = allQuestions[nextIndex];
    if (nextQuestion) {
      setAnswerState(createInitialAnswerState(nextQuestion));
    }
  }, [phase, currentIndex, allQuestions, onComplete, correctCount, wrongCount, lastResult]);

  // クイズをリセット
  const handleResetQuiz = useCallback(() => {
    setCurrentIndex(0);
    setCorrectCount(0);
    setWrongCount(0);
    setPhase('answering');
    setLastResult(null);

    const firstQuestion = allQuestions[0];
    if (firstQuestion) {
      setAnswerState(createInitialAnswerState(firstQuestion));
    }
  }, [allQuestions]);

  // 回答可能かどうか
  const canSubmit = useMemo(() => {
    if (!currentQuestion || phase !== 'answering') return false;
    return canSubmitAnswer(currentQuestion, answerState);
  }, [currentQuestion, answerState, phase]);

  // 進捗
  const progress: QuizProgress = useMemo(
    () => ({
      currentIndex,
      totalCount: allQuestions.length,
      correctCount,
      wrongCount,
    }),
    [currentIndex, allQuestions.length, correctCount, wrongCount]
  );

  return {
    // 状態
    currentQuestion,
    answerState,
    phase,
    progress,
    lastResult,

    // アクション
    selectWord: handleSelectWord,
    deselectWord: handleDeselectWord,
    deselectWordAtIndex: handleDeselectWordAtIndex,
    submitAnswer: handleSubmitAnswer,
    nextQuestion: handleNextQuestion,
    resetQuiz: handleResetQuiz,

    // ゲッター
    canSubmit,
    isCorrect: lastResult?.isCorrect ?? null,
    isCompleted: phase === 'completed',
  };
}

// ============ Simplified Hook for Single Question ============

export interface UseSingleQuestionReturn {
  answerState: AnswerState;
  phase: 'answering' | 'feedback';
  result: ValidationResult | null;

  selectWord: (word: string) => void;
  deselectWord: (word: string) => void;
  deselectWordAtIndex: (index: number) => void;
  submitAnswer: () => void;
  reset: () => void;

  canSubmit: boolean;
  isCorrect: boolean | null;
}

/**
 * 単一の問題を扱うシンプルなフック
 */
export function useSingleQuestion(
  question: AIGrammarQuizQuestion
): UseSingleQuestionReturn {
  const [answerState, setAnswerState] = useState<AnswerState>(() =>
    createInitialAnswerState(question)
  );
  const [phase, setPhase] = useState<'answering' | 'feedback'>('answering');
  const [result, setResult] = useState<ValidationResult | null>(null);

  const handleSelectWord = useCallback(
    (word: string) => {
      if (phase !== 'answering') return;
      setAnswerState((prev) => selectWord(prev, word));
    },
    [phase]
  );

  const handleDeselectWord = useCallback(
    (word: string) => {
      if (phase !== 'answering') return;
      setAnswerState((prev) => deselectWord(prev, word));
    },
    [phase]
  );

  const handleDeselectWordAtIndex = useCallback(
    (index: number) => {
      if (phase !== 'answering') return;
      setAnswerState((prev) => deselectWordAtIndex(prev, index));
    },
    [phase]
  );

  const handleSubmitAnswer = useCallback(() => {
    if (phase !== 'answering') return;
    const validationResult = validateAnswer(question, answerState);
    setResult(validationResult);
    setPhase('feedback');
  }, [phase, question, answerState]);

  const handleReset = useCallback(() => {
    setAnswerState(createInitialAnswerState(question));
    setPhase('answering');
    setResult(null);
  }, [question]);

  const canSubmit = useMemo(() => {
    if (phase !== 'answering') return false;
    return canSubmitAnswer(question, answerState);
  }, [question, answerState, phase]);

  return {
    answerState,
    phase,
    result,

    selectWord: handleSelectWord,
    deselectWord: handleDeselectWord,
    deselectWordAtIndex: handleDeselectWordAtIndex,
    submitAnswer: handleSubmitAnswer,
    reset: handleReset,

    canSubmit,
    isCorrect: result?.isCorrect ?? null,
  };
}
