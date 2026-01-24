'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { X, ChevronRight, Trophy, RotateCcw, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { shuffleArray } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

export default function QuizPage() {
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

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Generate quiz questions from words
  const generateQuestions = useCallback((words: Word[]): QuizQuestion[] => {
    // Shuffle and take up to 10 questions per session
    const selected = shuffleArray(words).slice(0, 10);

    return selected.map((word) => {
      // Shuffle correct answer with distractors
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
    // Wait for auth to be ready
    if (authLoading) return;

    const loadWords = async () => {
      try {
        const words = await repository.getWords(projectId);
        if (words.length === 0) {
          router.push(`/project/${projectId}`);
          return;
        }
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

  // Handle option selection
  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;

    // Update results
    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // Auto-advance after correct answer
    if (isCorrect) {
      setTimeout(() => {
        moveToNext();
      }, 500);
    }
  };

  // Move to next question
  const moveToNext = () => {
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setIsRevealed(false);
    }
  };

  // Restart quiz
  const handleRestart = () => {
    const regenerated = generateQuestions(
      questions.map((q) => q.word)
    );
    setQuestions(regenerated);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setIsComplete(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">クイズを準備中...</p>
        </div>
      </div>
    );
  }

  // Quiz complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);

    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <header className="p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Results */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm text-center">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-yellow-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              クイズ完了！
            </h1>

            <div className="mb-6">
              <p className="text-5xl font-bold text-blue-600 mb-1">
                {percentage}%
              </p>
              <p className="text-gray-500">
                {results.total}問中 {results.correct}問正解
              </p>
            </div>

            {/* Performance message */}
            <p className="text-gray-600 mb-8">
              {percentage === 100
                ? 'パーフェクト！素晴らしい！'
                : percentage >= 80
                ? 'よくできました！'
                : percentage >= 60
                ? 'もう少し！復習しましょう'
                : '繰り返し練習しましょう！'}
            </p>

            <div className="space-y-3">
              <Button onClick={handleRestart} className="w-full" size="lg">
                <RotateCcw className="w-5 h-5 mr-2" />
                もう一度
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
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {currentIndex + 1} / {questions.length}
          </span>
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 flex flex-col p-6">
        {/* English word */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <h1 className="text-4xl font-bold text-gray-900 text-center mb-4">
            {currentQuestion?.word.english}
          </h1>
          {/* Favorite button */}
          <button
            onClick={async () => {
              if (!currentQuestion) return;
              const word = currentQuestion.word;
              const newFavorite = !word.isFavorite;
              await repository.updateWord(word.id, { isFavorite: newFavorite });
              setQuestions((prev) =>
                prev.map((q, i) =>
                  i === currentIndex
                    ? { ...q, word: { ...q.word, isFavorite: newFavorite } }
                    : q
                )
              );
            }}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label={currentQuestion?.word.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Flag
              className={`w-6 h-6 transition-colors ${
                currentQuestion?.word.isFavorite
                  ? 'fill-orange-500 text-orange-500'
                  : 'text-gray-400'
              }`}
            />
          </button>
        </div>

        {/* Options */}
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

        {/* Example sentence (shown after answering, Pro feature) */}
        {isRevealed && currentQuestion?.word.exampleSentence && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl">
            <p className="text-sm font-medium text-blue-800 mb-1">例文</p>
            <p className="text-blue-900 italic">{currentQuestion.word.exampleSentence}</p>
            {currentQuestion.word.exampleSentenceJa && (
              <p className="text-sm text-blue-700 mt-1">{currentQuestion.word.exampleSentenceJa}</p>
            )}
          </div>
        )}

        {/* Next button (only shown when wrong answer selected) */}
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
