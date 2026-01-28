'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { X, ChevronRight, Trophy, RotateCcw, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

// Question count options
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30];
const DEFAULT_QUESTION_COUNT = 10;

export default function QuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading } = useAuth();

  // Get question count from URL or show selection screen
  const countFromUrl = searchParams.get('count');
  const [questionCount, setQuestionCount] = useState<number | null>(
    countFromUrl ? parseInt(countFromUrl, 10) : null
  );

  const [allWords, setAllWords] = useState<Word[]>([]); // Store all words for restart
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
  const generateQuestions = useCallback((words: Word[], count: number): QuizQuestion[] => {
    // Shuffle and take up to count questions per session
    const selected = shuffleArray(words).slice(0, count);

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
        setAllWords(words); // Store all words for restart

        // Only generate questions if question count is set
        if (questionCount) {
          const generated = generateQuestions(words, questionCount);
          setQuestions(generated);
        }
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, authLoading, questionCount]);

  const currentQuestion = questions[currentIndex];

  // Handle option selection
  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;
    const word = currentQuestion.word;

    // Update results
    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // Record stats for daily tracking
    if (isCorrect) {
      // Check if word becomes mastered (you could add logic here)
      recordCorrectAnswer(false);
    } else {
      recordWrongAnswer(word.id, word.english, word.japanese);
    }

    // Record activity for streak tracking
    recordActivity();
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

  // Restart quiz with new random questions from all words
  const handleRestart = () => {
    // Use allWords to get completely new random questions
    const regenerated = generateQuestions(allWords, questionCount || DEFAULT_QUESTION_COUNT);
    setQuestions(regenerated);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setIsComplete(false);
  };

  // Handle question count selection
  const handleSelectCount = (count: number) => {
    setQuestionCount(count);
    if (allWords.length > 0) {
      const generated = generateQuestions(allWords, count);
      setQuestions(generated);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">クイズを準備中...</p>
        </div>
      </div>
    );
  }

  // Question count selection screen
  if (!questionCount) {
    // Calculate available question counts based on word count
    const maxQuestions = allWords.length;
    const availableOptions = QUESTION_COUNT_OPTIONS.filter(n => n <= maxQuestions);
    // Add "All" option if words count doesn't match any preset
    const showAllOption = maxQuestions > 0 && !QUESTION_COUNT_OPTIONS.includes(maxQuestions);

    return (
      <div className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
        {/* Header */}
        <header className="flex-shrink-0 p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Selection */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
              問題数を選択
            </h1>
            <p className="text-gray-500 text-center mb-8">
              全{maxQuestions}問から出題
            </p>

            <div className="grid grid-cols-2 gap-3">
              {availableOptions.map((count) => (
                <button
                  key={count}
                  onClick={() => handleSelectCount(count)}
                  className="p-4 bg-white rounded-xl shadow-sm border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  <span className="text-2xl font-bold text-gray-900">{count}</span>
                  <span className="text-sm text-gray-500 ml-1">問</span>
                </button>
              ))}
              {showAllOption && (
                <button
                  onClick={() => handleSelectCount(maxQuestions)}
                  className="p-4 bg-white rounded-xl shadow-sm border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all"
                >
                  <span className="text-2xl font-bold text-gray-900">全部</span>
                  <span className="text-sm text-gray-500 ml-1">({maxQuestions}問)</span>
                </button>
              )}
            </div>
          </div>
        </main>
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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
      {/* Header */}
      <header className="flex-shrink-0 p-4 flex items-center justify-between">
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
      <main className="flex-1 flex flex-col p-6 overflow-y-auto pb-24">
        {/* English word */}
        <div className="flex flex-col items-center justify-center py-4">
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
        <div className="space-y-3 mb-4">
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
      </main>

      {/* Fixed bottom next button (shown after answering) */}
      {isRevealed && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-area-bottom z-50">
          <Button onClick={moveToNext} className="w-full" size="lg">
            次へ
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
