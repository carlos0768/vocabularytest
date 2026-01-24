'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { X, ChevronRight, Trophy, RotateCcw, Brain, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { shuffleArray } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  getWordsDueForReview,
  calculateNextReview,
} from '@/lib/spaced-repetition';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

export default function ReviewPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading } = useAuth();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [results, setResults] = useState<{ correct: number; total: number }>({
    correct: 0,
    total: 0,
  });
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if user is Pro
  const isPro = subscription?.status === 'active';
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(
    () => getRepository(subscriptionStatus),
    [subscriptionStatus]
  );

  // Generate quiz questions from words due for review
  const generateQuestions = useCallback((words: Word[]): QuizQuestion[] => {
    // Get words due for review
    const dueWords = getWordsDueForReview(words);

    if (dueWords.length === 0) {
      return [];
    }

    // Take up to 10 questions per session
    const selected = shuffleArray(dueWords).slice(0, 10);

    return selected.map((word) => {
      const allOptions = [word.japanese, ...word.distractors];
      const shuffled = shuffleArray(allOptions);
      const correctIndex = shuffled.indexOf(word.japanese);

      return {
        word,
        options: shuffled,
        correctIndex,
      };
    });
  }, []);

  // Load words and create questions
  useEffect(() => {
    if (authLoading) return;

    const loadWords = async () => {
      try {
        const words = await repository.getWords(projectId);
        const generated = generateQuestions(words);
        setQuestions(generated);
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, authLoading]);

  const currentQuestion = questions[currentIndex];

  // Handle option selection with SM-2 update
  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;

    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // Calculate next review using SM-2 algorithm
    const word = currentQuestion.word;
    const srUpdate = calculateNextReview(isCorrect, word);

    // Update word with new spaced repetition data
    await repository.updateWord(word.id, {
      status: isCorrect
        ? word.status === 'new'
          ? 'review'
          : word.status === 'review'
            ? 'mastered'
            : 'mastered'
        : word.status === 'mastered'
          ? 'review'
          : word.status,
      ...srUpdate,
    });

    // Auto-advance after correct answer
    if (isCorrect) {
      setTimeout(() => {
        moveToNext();
      }, 500);
    }
  };

  const moveToNext = () => {
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setIsRevealed(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      const words = await repository.getWords(projectId);
      const regenerated = generateQuestions(words);
      setQuestions(regenerated);
      setCurrentIndex(0);
      setSelectedIndex(null);
      setIsRevealed(false);
      setResults({ correct: 0, total: 0 });
      setIsComplete(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">復習を準備中...</p>
        </div>
      </div>
    );
  }

  // Pro-only gate
  if (!isPro) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <header className="p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6 dark:text-gray-300" />
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-8 w-full max-w-sm text-center">
            <div className="w-20 h-20 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-10 h-10 text-purple-600 dark:text-purple-400" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Pro限定機能
            </h1>

            <p className="text-gray-600 dark:text-gray-400 mb-8">
              忘却曲線に基づく復習機能は
              <br />
              Proプランでご利用いただけます
            </p>

            <div className="space-y-3">
              <Link href="/subscription">
                <Button className="w-full" size="lg">
                  Proにアップグレード
                </Button>
              </Link>
              <Button
                variant="secondary"
                onClick={() => router.push(`/project/${projectId}`)}
                className="w-full"
                size="lg"
              >
                戻る
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // No words due for review
  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <header className="p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6 dark:text-gray-300" />
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-8 w-full max-w-sm text-center">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Brain className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              復習完了！
            </h1>

            <p className="text-gray-600 dark:text-gray-400 mb-8">
              今日復習が必要な単語はありません。
              <br />
              また明日確認してください！
            </p>

            <Button
              variant="secondary"
              onClick={() => router.push(`/project/${projectId}`)}
              className="w-full"
              size="lg"
            >
              単語一覧に戻る
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Quiz complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);

    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <header className="p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6 dark:text-gray-300" />
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-8 w-full max-w-sm text-center">
            <div className="w-20 h-20 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              復習完了！
            </h1>

            <div className="mb-6">
              <p className="text-5xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                {percentage}%
              </p>
              <p className="text-gray-500 dark:text-gray-400">
                {results.total}問中 {results.correct}問正解
              </p>
            </div>

            <p className="text-gray-600 dark:text-gray-400 mb-8">
              {percentage === 100
                ? 'パーフェクト！記憶が定着しています！'
                : percentage >= 80
                  ? 'よくできました！'
                  : percentage >= 60
                    ? 'もう少し復習しましょう'
                    : '間違えた単語は明日また復習できます！'}
            </p>

            <div className="space-y-3">
              <Button onClick={handleRestart} className="w-full" size="lg">
                <RotateCcw className="w-5 h-5 mr-2" />
                続けて復習
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push(`/project/${projectId}`)}
                className="w-full"
                size="lg"
              >
                単語一覧に戻る
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        >
          <X className="w-6 h-6 dark:text-gray-300" />
        </button>

        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {currentIndex + 1} / {questions.length}
          </span>
          <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white text-center">
            {currentQuestion?.word.english}
          </h1>
        </div>

        <div className="space-y-3 mb-6">
          {currentQuestion?.options.map((option, index) => (
            <QuizOption
              key={index}
              label={option}
              index={index}
              isSelected={selectedIndex === index}
              isCorrect={index === currentQuestion.correctIndex}
              isRevealed={isRevealed}
              onSelect={() => handleSelect(index)}
              disabled={isRevealed}
            />
          ))}
        </div>

        {isRevealed && selectedIndex !== currentQuestion?.correctIndex && (
          <Button onClick={moveToNext} className="w-full" size="lg">
            次へ
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        )}
      </main>
    </div>
  );
}
