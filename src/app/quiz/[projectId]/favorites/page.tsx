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

export default function FavoritesQuizPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const { subscription, isPro, loading: authLoading } = useAuth();

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

  // Generate quiz questions from favorite words only
  const generateQuestions = useCallback((words: Word[]): QuizQuestion[] => {
    // Filter only favorite words
    const favoriteWords = words.filter((w) => w.isFavorite);

    // Take up to 10 questions per session
    const selected = shuffleArray(favoriteWords).slice(0, 10);

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

    if (!isPro) {
      router.push('/subscription');
      return;
    }

    const loadWords = async () => {
      try {
        const words = await repository.getWords(projectId);
        const favoriteWords = words.filter((w) => w.isFavorite);

        if (favoriteWords.length === 0) {
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
  }, [projectId, repository, router, generateQuestions, authLoading, isPro]);

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

  // Toggle favorite status
  const handleToggleFavorite = async () => {
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
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">苦手クイズを準備中...</p>
        </div>
      </div>
    );
  }

  // Quiz complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);

    return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
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
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-orange-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              苦手クイズ完了！
            </h1>

            <div className="mb-6">
              <p className="text-5xl font-bold text-orange-500 mb-1">
                {percentage}%
              </p>
              <p className="text-gray-500">
                {results.total}問中 {results.correct}問正解
              </p>
            </div>

            {/* Performance message */}
            <p className="text-gray-600 mb-8">
              {percentage === 100
                ? '苦手を克服！素晴らしい！'
                : percentage >= 80
                ? 'よくできました！もう少しで克服！'
                : percentage >= 60
                ? '頑張りました！繰り返し練習しましょう'
                : '苦手は繰り返しが大事！もう一度！'}
            </p>

            <div className="space-y-3">
              <Button onClick={handleRestart} className="w-full bg-orange-500 hover:bg-orange-600" size="lg">
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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 p-4 flex items-center justify-between">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Title badge */}
        <div className="flex items-center gap-2 bg-orange-100 px-3 py-1 rounded-full">
          <Flag className="w-4 h-4 fill-orange-500 text-orange-500" />
          <span className="text-sm font-medium text-orange-700">苦手クイズ</span>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {currentIndex + 1} / {questions.length}
          </span>
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 flex flex-col p-6 min-h-0 overflow-hidden">
        {/* English word */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center py-4">
          <h1 className="text-4xl font-bold text-gray-900 text-center mb-4">
            {currentQuestion?.word.english}
          </h1>
          {/* Favorite button */}
          <button
            onClick={handleToggleFavorite}
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
        <div className="flex-shrink-0 space-y-3 mb-4">
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
          <div className="flex-shrink-0 mb-4 p-4 bg-orange-50 rounded-xl">
            <p className="text-sm font-medium text-orange-800 mb-1">例文</p>
            <p className="text-orange-900 italic">{currentQuestion.word.exampleSentence}</p>
            {currentQuestion.word.exampleSentenceJa && (
              <p className="text-sm text-orange-700 mt-1">{currentQuestion.word.exampleSentenceJa}</p>
            )}
          </div>
        )}

        {/* Next button (only shown when wrong answer selected) */}
        {isRevealed && selectedIndex !== currentQuestion?.correctIndex && (
          <Button onClick={moveToNext} className="flex-shrink-0 w-full bg-orange-500 hover:bg-orange-600" size="lg">
            次へ
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        )}
      </main>
    </div>
  );
}
