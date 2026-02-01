'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronRight, Trophy, RotateCcw, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { InlineFlashcard } from '@/components/home/InlineFlashcard';
import { getRepository } from '@/lib/db';
import { getTodayReviewWords, type ReviewWord } from '@/lib/review';
import { calculateNextReview } from '@/lib/spaced-repetition';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  getCachedProjects,
  getCachedProjectWords,
} from '@/lib/home-cache';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

export default function ReviewPage() {
  const router = useRouter();
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

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
  const [generatingDistractors, setGeneratingDistractors] = useState(false);
  const [allWords, setAllWords] = useState<Word[]>([]);

  // Build quiz questions from review words
  const buildQuestions = useCallback((words: Word[]): QuizQuestion[] => {
    return words.map((word) => {
      const allOptions = [word.japanese, ...word.distractors];
      const shuffled = shuffleArray(allOptions);
      const correctIndex = shuffled.indexOf(word.japanese);
      return { word, options: shuffled, correctIndex };
    });
  }, []);

  // Generate distractors for words that need them, then build questions
  const startWithDistractors = useCallback(async (words: Word[]) => {
    const needDistractors = words.filter(
      (w) => !w.distractors || w.distractors.length === 0 ||
        (w.distractors.length === 3 && w.distractors[0] === '選択肢1')
    );

    let updatedWords = words;

    if (needDistractors.length > 0) {
      setGeneratingDistractors(true);
      try {
        const response = await fetch('/api/generate-quiz-distractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            words: needDistractors.map((w) => ({
              id: w.id,
              english: w.english,
              japanese: w.japanese,
            })),
          }),
        });

        const data = await response.json();
        if (data.success && data.results) {
          const distractorMap = new Map<string, string[]>();
          for (const result of data.results) {
            distractorMap.set(result.wordId, result.distractors);
          }

          updatedWords = words.map((w) => {
            const newDistractors = distractorMap.get(w.id);
            return newDistractors ? { ...w, distractors: newDistractors } : w;
          });

          // Save distractors to DB
          const updatePromises: Promise<void>[] = [];
          for (const result of data.results) {
            updatePromises.push(
              repository.updateWord(result.wordId, { distractors: result.distractors })
            );
          }
          await Promise.all(updatePromises);
        }
      } catch (error) {
        console.error('Failed to generate distractors:', error);
      } finally {
        setGeneratingDistractors(false);
      }
    }

    // Filter out words that still have no distractors
    const quizReady = updatedWords.filter(
      (w) => w.distractors && w.distractors.length > 0
    );

    setAllWords(quizReady);
    setQuestions(buildQuestions(quizReady));
  }, [repository, buildQuestions]);

  // Load review words from cache or fetch
  useEffect(() => {
    if (authLoading) return;

    const loadReviewWords = async () => {
      try {
        let projectWords = getCachedProjectWords();
        let projects = getCachedProjects();

        // If cache is empty, load from repository
        if (Object.keys(projectWords).length === 0) {
          const userId = isPro && user ? user.id : '';
          if (!userId && !isPro) {
            // Guest user - need to load from local repository
            const { getGuestUserId } = await import('@/lib/utils');
            const guestId = getGuestUserId();
            projects = await repository.getProjects(guestId);
          } else {
            projects = await repository.getProjects(userId);
          }

          projectWords = {};
          for (const project of projects) {
            projectWords[project.id] = await repository.getWords(project.id);
          }
        }

        const todayReview = getTodayReviewWords(projectWords, projects);
        setReviewWords(todayReview);

        if (todayReview.length === 0) {
          setLoading(false);
          return;
        }

        const words = todayReview.map((rw) => rw.word);
        await startWithDistractors(words);
      } catch (error) {
        console.error('Failed to load review words:', error);
      } finally {
        setLoading(false);
      }
    };

    loadReviewWords();
  }, [authLoading, isPro, user, repository, startWithDistractors]);

  const currentQuestion = questions[currentIndex];

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

    if (isCorrect) {
      recordCorrectAnswer(false);
    } else {
      recordWrongAnswer(word.id, word.english, word.japanese, word.projectId, word.distractors);
    }

    recordActivity();

    // Update SM-2 parameters
    try {
      const sm2Update = calculateNextReview(isCorrect, word);
      await repository.updateWord(word.id, sm2Update);

      // Update local state
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === currentIndex
            ? { ...q, word: { ...q.word, ...sm2Update } }
            : q
        )
      );
    } catch (error) {
      console.error('Failed to update SM-2 parameters:', error);
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
    const shuffled = shuffleArray([...allWords]);
    setQuestions(buildQuestions(shuffled));
    setCurrentIndex(0);
    setSelectedIndex(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setIsComplete(false);
  };

  // Loading screen
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">復習単語を準備中...</p>
        </div>
      </div>
    );
  }

  // Generating distractors - show flashcard while waiting
  if (generatingDistractors) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="flex-shrink-0 p-4">
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-6 min-h-0">
          <div className="mb-4 text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-[var(--color-foreground)] font-semibold">クイズを生成中...</p>
            </div>
            <p className="text-sm text-[var(--color-muted)]">
              フラッシュカードで復習しながらお待ちください
            </p>
          </div>
          <div className="w-full max-w-sm">
            <InlineFlashcard words={reviewWords.map((rw) => rw.word)} />
          </div>
        </main>
      </div>
    );
  }

  // No review words
  if (reviewWords.length === 0) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
        <header className="flex-shrink-0 p-4">
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mb-6">
            <CalendarCheck className="w-10 h-10 text-[var(--color-success)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
            復習完了!
          </h1>
          <p className="text-[var(--color-muted)] text-center mb-8">
            今日復習する単語はありません。
          </p>
          <Button onClick={() => router.push('/')} size="lg">
            ホームに戻る
          </Button>
        </main>
      </div>
    );
  }

  // No quiz-ready words (all missing distractors)
  if (questions.length === 0) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
        <header className="flex-shrink-0 p-4">
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <p className="text-[var(--color-muted)] text-center mb-6">
            クイズの準備ができませんでした。
          </p>
          <Button onClick={() => router.push('/')} size="lg">
            ホームに戻る
          </Button>
        </main>
      </div>
    );
  }

  // Quiz complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);

    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
        <header className="p-4">
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="card p-8 w-full max-w-sm text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-[var(--color-success)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
              復習完了!
            </h1>
            <div className="mb-6">
              <p className="text-5xl font-bold text-[var(--color-primary)] mb-1">
                {percentage}%
              </p>
              <p className="text-[var(--color-muted)]">
                {results.total}問中 {results.correct}問正解
              </p>
            </div>
            <p className="text-[var(--color-foreground)] mb-8">
              {percentage === 100
                ? 'パーフェクト! 素晴らしい!'
                : percentage >= 80
                ? 'よくできました!'
                : percentage >= 60
                ? 'もう少し! 復習しましょう'
                : '繰り返し練習しましょう!'}
            </p>
            <div className="space-y-3">
              <Button onClick={handleRestart} className="w-full" size="lg">
                <RotateCcw className="w-5 h-5 mr-2" />
                もう一度
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/')}
                className="w-full"
                size="lg"
              >
                ホームに戻る
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Main quiz screen
  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      {/* Header with progress */}
      <header className="flex-shrink-0 p-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/')}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="flex-1 progress-bar">
          <div
            className="progress-bar-fill"
            style={{
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
            }}
          />
        </div>
        <span className="text-sm text-[var(--color-muted)] font-medium tabular-nums">
          {currentIndex + 1}/{questions.length}
        </span>
      </header>

      {/* Question */}
      <main className="flex-1 flex flex-col p-6 overflow-y-auto pb-24">
        {/* Project name badge */}
        {(() => {
          const rw = reviewWords.find((r) => r.word.id === currentQuestion?.word.id);
          return rw?.projectName ? (
            <div className="flex justify-center mb-2">
              <span className="text-xs text-[var(--color-muted)] bg-[var(--color-surface)] px-3 py-1 rounded-full border border-[var(--color-border)]">
                {rw.projectName}
                {rw.daysOverdue > 0 && (
                  <span className="ml-1 text-[var(--color-primary)]">
                    ({rw.daysOverdue}日遅れ)
                  </span>
                )}
              </span>
            </div>
          ) : null;
        })()}

        {/* English word */}
        <div className="flex flex-col items-center justify-center py-8 animate-fade-in-up">
          <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] text-center mb-4 tracking-tight">
            {currentQuestion?.word.english}
          </h1>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-4 max-w-lg mx-auto w-full">
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

        {/* Example sentence (shown after answering) */}
        {isRevealed && currentQuestion?.word.exampleSentence && (
          <div className="mb-4 p-4 bg-[var(--color-peach-light)] rounded-2xl max-w-lg mx-auto w-full">
            <p className="text-sm font-semibold text-[var(--color-primary)] mb-1">例文</p>
            <p className="text-[var(--color-foreground)] italic">{currentQuestion.word.exampleSentence}</p>
            {currentQuestion.word.exampleSentenceJa && (
              <p className="text-sm text-[var(--color-muted)] mt-1">{currentQuestion.word.exampleSentenceJa}</p>
            )}
          </div>
        )}
      </main>

      {/* Fixed bottom next button */}
      {isRevealed && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-background)] p-6 safe-area-bottom z-50">
          <Button onClick={moveToNext} className="w-full max-w-lg mx-auto flex" size="lg">
            次へ
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
