'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronRight, Trophy, RotateCcw, BookOpen, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { InlineFlashcard } from '@/components/home/InlineFlashcard';
import { getRepository } from '@/lib/db';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { getTodayReviewWords, updateSM2Parameters, type ReviewWord } from '@/lib/review';
import { useAuth } from '@/hooks/use-auth';
import type { QuizQuestion } from '@/types';

export default function ReviewPage() {
  const router = useRouter();
  const { subscription } = useAuth();
  
  const [reviewWords, setReviewWords] = useState<ReviewWord[]>([]);
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
  const [updating, setUpdating] = useState(false);

  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Load today's review words
  useEffect(() => {
    const loadReviewWords = () => {
      const words = getTodayReviewWords();
      setReviewWords(words);

      if (words.length === 0) {
        setLoading(false);
        return;
      }

      // Generate quiz questions from review words
      const generated = words.map((reviewWord) => {
        const { word } = reviewWord;
        const allOptions = [word.japanese, ...word.distractors];
        const shuffled = shuffleArray(allOptions);
        const correctIndex = shuffled.indexOf(word.japanese);

        return {
          word,
          options: shuffled,
          correctIndex,
        };
      });

      setQuestions(generated);
      setLoading(false);
    };

    loadReviewWords();
  }, []);

  const currentQuestion = questions[currentIndex];
  const currentReviewWord = reviewWords[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex) / questions.length) * 100 : 0;

  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;
    const word = currentQuestion.word;

    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // Update SM-2 parameters based on answer quality
    // 5 = perfect, 4 = correct with hesitation, 3 = correct but difficult
    // 2 = incorrect but remembered, 1 = incorrect, 0 = complete blackout
    const quality = isCorrect ? 4 : 1;
    
    setUpdating(true);
    try {
      const updates = updateSM2Parameters(word, quality);
      await repository.updateWord(word.id, updates);

      if (isCorrect) {
        recordCorrectAnswer(false);
      } else {
        recordWrongAnswer(word.id, word.english, word.japanese, currentReviewWord.projectId, word.distractors);
      }

      recordActivity();
    } catch (error) {
      console.error('Failed to update SM-2 parameters:', error);
    } finally {
      setUpdating(false);
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

  const handleRestart = () => {
    // Reload review words
    const words = getTodayReviewWords();
    setReviewWords(words);

    if (words.length > 0) {
      const generated = words.map((reviewWord) => {
        const { word } = reviewWord;
        const allOptions = [word.japanese, ...word.distractors];
        const shuffled = shuffleArray(allOptions);
        const correctIndex = shuffled.indexOf(word.japanese);

        return {
          word,
          options: shuffled,
          correctIndex,
        };
      });

      setQuestions(generated);
    }

    setCurrentIndex(0);
    setSelectedIndex(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setIsComplete(false);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Empty state - no review words
  if (reviewWords.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--color-background)]">
        {/* Header */}
        <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6 text-[var(--color-muted)]" />
            </button>
            <h1 className="text-lg font-bold text-[var(--color-foreground)]">今日の復習</h1>
            <div className="w-10" />
          </div>
        </header>

        <main className="flex flex-col items-center justify-center px-6 py-20">
          <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mb-6">
            <Trophy className="w-10 h-10 text-[var(--color-success)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-2">
            おめでとう！🎉
          </h2>
          <p className="text-[var(--color-muted)] text-center mb-8">
            今日の復習はすべて完了です
          </p>
          <Button onClick={() => router.push('/')} variant="primary">
            ホームに戻る
          </Button>
        </main>
      </div>
    );
  }

  // Completion screen
  if (isComplete) {
    const accuracy = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;

    return (
      <div className="min-h-screen bg-[var(--color-background)]">
        {/* Header */}
        <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6 text-[var(--color-muted)]" />
            </button>
            <h1 className="text-lg font-bold text-[var(--color-foreground)]">今日の復習</h1>
            <div className="w-10" />
          </div>
        </header>

        <main className="flex flex-col items-center justify-center px-6 py-12">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-12 h-12 text-[var(--color-primary)]" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
              復習完了！
            </h2>
            <p className="text-[var(--color-muted)]">
              {results.correct}/{results.total} 正解 ({accuracy}%)
            </p>
          </div>

          {/* Stats */}
          <div className="w-full max-w-sm space-y-3 mb-8">
            <div className="card p-4 flex items-center justify-between">
              <span className="text-[var(--color-muted)]">復習単語数</span>
              <span className="font-bold text-[var(--color-foreground)]">{reviewWords.length}語</span>
            </div>
            <div className="card p-4 flex items-center justify-between">
              <span className="text-[var(--color-muted)]">正答率</span>
              <span className={`font-bold ${accuracy >= 80 ? 'text-[var(--color-success)]' : accuracy >= 60 ? 'text-[var(--color-primary)]' : 'text-[var(--color-error)]'}`}>
                {accuracy}%
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleRestart} variant="secondary" className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              もう一度
            </Button>
            <Button onClick={() => router.push('/')} variant="primary">
              ホームに戻る
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Quiz screen
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => router.push('/')}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6 text-[var(--color-muted)]" />
            </button>
            <span className="text-sm font-medium text-[var(--color-muted)]">
              {currentIndex + 1} / {questions.length}
            </span>
            <div className="w-10" />
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      {/* Word Info */}
      <div className="px-6 py-2 border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <BookOpen className="w-4 h-4" />
          <span>{currentReviewWord?.projectName}</span>
          {currentReviewWord?.daysOverdue > 0 && (
            <>
              <span>•</span>
              <span className="text-[var(--color-error)] flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {currentReviewWord.daysOverdue}日遅れ
              </span>
            </>
          )}
        </div>
      </div>

      {/* Quiz Content */}
      <main className="flex-1 max-w-lg mx-auto px-6 py-6 w-full">
        <div className="mb-6">
          <InlineFlashcard words={[currentQuestion.word]} />
        </div>

        <div className="space-y-3">
          {currentQuestion.options.map((option, index) => (
            <QuizOption
              key={index}
              label={option}
              index={index}
              isCorrect={index === currentQuestion.correctIndex}
              isRevealed={isRevealed}
              isSelected={selectedIndex === index}
              onSelect={() => handleSelect(index)}
              disabled={isRevealed}
            />
          ))}
        </div>
      </main>

      {/* Bottom Action */}
      <div className="sticky bottom-0 bg-[var(--color-background)] border-t border-[var(--color-border)] px-6 py-4">
        <div className="max-w-lg mx-auto">
          {isRevealed ? (
            <Button
              onClick={moveToNext}
              variant="primary"
              className="w-full flex items-center justify-center gap-2"
              disabled={updating}
            >
              {updating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  更新中...
                </>
              ) : (
                <>
                  {currentIndex + 1 >= questions.length ? '結果を見る' : '次へ'}
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </Button>
          ) : (
            <div className="text-center text-sm text-[var(--color-muted)]">
              正解を選んでください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
