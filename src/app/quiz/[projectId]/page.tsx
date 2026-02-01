'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { X, ChevronRight, Trophy, RotateCcw, Flag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { InlineFlashcard } from '@/components/home/InlineFlashcard';
import { getRepository } from '@/lib/db';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

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

  const [allWords, setAllWords] = useState<Word[]>([]);
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
  const [distractorError, setDistractorError] = useState<string | null>(null);
  const [inputCount, setInputCount] = useState('');

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const isPro = subscriptionStatus === 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Generate example sentences for words that don't have them (Pro only, runs in background)
  const generateExamplesInBackground = useCallback(async (words: Word[]) => {
    if (!isPro) return;

    // Filter words that need example sentences
    const wordsNeedingExamples = words.filter(
      w => !w.exampleSentence || w.exampleSentence.trim().length === 0
    );

    if (wordsNeedingExamples.length === 0) return;

    try {
      const response = await fetch('/api/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: wordsNeedingExamples.map(w => ({
            id: w.id,
            english: w.english,
            japanese: w.japanese,
          })),
        }),
      });

      if (!response.ok) return;

      // Refresh words to get the generated examples
      const updatedWords = await repository.getWords(projectId);
      setAllWords(updatedWords);

      // Update questions with new example sentences
      setQuestions(prev => prev.map(q => {
        const updatedWord = updatedWords.find(w => w.id === q.word.id);
        return updatedWord ? { ...q, word: updatedWord } : q;
      }));
    } catch (error) {
      console.error('Failed to generate examples:', error);
      // Silently fail - example sentences are not critical
    }
  }, [isPro, projectId, repository]);

  const generateQuestions = useCallback((words: Word[], count: number): QuizQuestion[] => {
    const selected = shuffleArray(words).slice(0, count);

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

  // Generate distractors for words that don't have them, then start quiz
  const startQuizWithDistractors = useCallback(async (words: Word[], count: number) => {
    const selected = shuffleArray(words).slice(0, count);

    // Find words that need distractors
    const wordsNeedingDistractors = selected.filter(
      (w) => !w.distractors || w.distractors.length === 0 ||
        (w.distractors.length === 3 && w.distractors[0] === '選択肢1')
    );

    let updatedSelected = selected;
    setDistractorError(null);

    if (wordsNeedingDistractors.length > 0) {
      setGeneratingDistractors(true);

      try {
        const response = await fetch('/api/generate-quiz-distractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            words: wordsNeedingDistractors.map((w) => ({
              id: w.id,
              english: w.english,
              japanese: w.japanese,
            })),
          }),
        });

        const data = await response.json();

        if (data.success && data.results) {
          // Create a map of wordId -> distractors
          const distractorMap = new Map<string, string[]>();
          for (const result of data.results) {
            distractorMap.set(result.wordId, result.distractors);
          }

          // Update words with generated distractors
          updatedSelected = selected.map((w) => {
            const newDistractors = distractorMap.get(w.id);
            if (newDistractors) {
              return { ...w, distractors: newDistractors };
            }
            return w;
          });

          // Check if all words now have distractors
          const stillMissing = updatedSelected.filter(
            (w) => !w.distractors || w.distractors.length === 0
          );
          if (stillMissing.length > 0) {
            setGeneratingDistractors(false);
            setDistractorError('一部の単語で選択肢の生成に失敗しました。再試行してください。');
            return;
          }

          // Save distractors to DB and update local state
          const updatePromises: Promise<void>[] = [];
          for (const result of data.results) {
            updatePromises.push(
              repository.updateWord(result.wordId, { distractors: result.distractors })
            );
          }
          await Promise.all(updatePromises);

          // Update allWords state with new distractors
          setAllWords((prev) =>
            prev.map((w) => {
              const newDistractors = distractorMap.get(w.id);
              return newDistractors ? { ...w, distractors: newDistractors } : w;
            })
          );
        } else {
          // API returned error
          setGeneratingDistractors(false);
          setDistractorError(data.error || 'クイズの生成に失敗しました。再試行してください。');
          return;
        }
      } catch (error) {
        console.error('Failed to generate distractors:', error);
        setGeneratingDistractors(false);
        setDistractorError('クイズの生成に失敗しました。再試行してください。');
        return;
      } finally {
        setGeneratingDistractors(false);
      }
    }

    // Generate quiz questions from updated words
    const quizQuestions = updatedSelected.map((word) => {
      const allOptions = [word.japanese, ...word.distractors];
      const shuffled = shuffleArray(allOptions);
      const correctIndex = shuffled.indexOf(word.japanese);

      return {
        word,
        options: shuffled,
        correctIndex,
      };
    });

    setQuestions(quizQuestions);

    // Generate example sentences in background (Pro only)
    generateExamplesInBackground(updatedSelected);
  }, [repository, generateExamplesInBackground]);

  useEffect(() => {
    if (authLoading) return;

    const loadWords = async () => {
      try {
        const words = await repository.getWords(projectId);
        if (words.length === 0) {
          router.push(`/project/${projectId}`);
          return;
        }
        setAllWords(words);

        if (questionCount) {
          // Check if any words might need distractors
          const needsGeneration = words.some(
            (w) => !w.distractors || w.distractors.length === 0 ||
              (w.distractors.length === 3 && w.distractors[0] === '選択肢1')
          );

          if (needsGeneration) {
            await startQuizWithDistractors(words, questionCount);
          } else {
            const generated = generateQuestions(words, questionCount);
            setQuestions(generated);
            // Generate example sentences in background (Pro only)
            const selectedWords = generated.map(q => q.word);
            generateExamplesInBackground(selectedWords);
          }
        }
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, startQuizWithDistractors, generateExamplesInBackground, authLoading, questionCount]);

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
      // Auto-advance after correct answer (Duolingo style)
      setTimeout(() => {
        moveToNext();
      }, 1000);
    } else {
      recordWrongAnswer(word.id, word.english, word.japanese, projectId, word.distractors);
    }

    recordActivity();
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
    const count = questionCount || DEFAULT_QUESTION_COUNT;

    // Check if any words still need distractors
    const needsGeneration = allWords.some(
      (w) => !w.distractors || w.distractors.length === 0 ||
        (w.distractors.length === 3 && w.distractors[0] === '選択肢1')
    );

    if (needsGeneration) {
      await startQuizWithDistractors(allWords, count);
    } else {
      const regenerated = generateQuestions(allWords, count);
      setQuestions(regenerated);
    }

    setCurrentIndex(0);
    setSelectedIndex(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setIsComplete(false);
  };

  const handleSelectCount = async (count: number) => {
    setQuestionCount(count);
    if (allWords.length > 0) {
      // Check if any words need distractors
      const needsGeneration = allWords.some(
        (w) => !w.distractors || w.distractors.length === 0 ||
          (w.distractors.length === 3 && w.distractors[0] === '選択肢1')
      );

      if (needsGeneration) {
        await startQuizWithDistractors(allWords, count);
      } else {
        const generated = generateQuestions(allWords, count);
        setQuestions(generated);
        // Generate example sentences in background (Pro only)
        const selectedWords = generated.map(q => q.word);
        generateExamplesInBackground(selectedWords);
      }
    }
  };

  // Loading screen (initial load)
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">クイズを準備中...</p>
        </div>
      </div>
    );
  }

  // Generating distractors - show flashcard while waiting
  if (generatingDistractors) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        {/* Header */}
        <header className="flex-shrink-0 p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Flashcard - centered */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-6 min-h-0">
          {/* Loading indicator */}
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
            <InlineFlashcard words={allWords} />
          </div>
        </main>
      </div>
    );
  }

  // Distractor generation error screen
  if (distractorError) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="flex-shrink-0 p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <p className="text-red-600 mb-6">{distractorError}</p>
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setDistractorError(null);
                  if (questionCount) {
                    startQuizWithDistractors(allWords, questionCount);
                  }
                }}
                className="w-full"
                size="lg"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                再試行
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

  // Question count selection screen
  if (!questionCount) {
    const maxQuestions = allWords.length;
    const parsedInput = parseInt(inputCount, 10);
    const isValidInput = !isNaN(parsedInput) && parsedInput >= 1 && parsedInput <= maxQuestions;

    const handleSubmit = () => {
      if (isValidInput) {
        handleSelectCount(parsedInput);
      }
    };

    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        {/* Header */}
        <header className="flex-shrink-0 p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Selection */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm animate-fade-in-up">
            <h1 className="text-2xl font-bold text-[var(--color-foreground)] text-center mb-2">
              問題数を入力
            </h1>
            <p className="text-[var(--color-muted)] text-center mb-8">
              1〜{maxQuestions}問まで
            </p>

            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={1}
                  max={maxQuestions}
                  value={inputCount}
                  onChange={(e) => setInputCount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isValidInput) {
                      handleSubmit();
                    }
                  }}
                  placeholder={String(DEFAULT_QUESTION_COUNT)}
                  className="w-24 text-center text-3xl font-bold px-4 py-3 border-2 border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] focus:border-[var(--color-primary)] focus:outline-none transition-colors"
                  autoFocus
                />
                <span className="text-xl text-[var(--color-muted)]">問</span>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!isValidInput}
                className="w-full"
                size="lg"
              >
                スタート
              </Button>
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
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
        {/* Header */}
        <header className="p-4">
          <button
            onClick={() => router.push(`/project/${projectId}`)}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* Results */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="card p-8 w-full max-w-sm text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-[var(--color-success)]" />
            </div>

            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
              クイズ完了!
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

  // Main quiz screen
  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      {/* Header */}
      <header className="flex-shrink-0 p-4 flex items-center gap-4">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Progress bar */}
        <div className="flex-1 progress-bar">
          <div
            className="progress-bar-fill"
            style={{
              width: `${((currentIndex + 1) / questions.length) * 100}%`,
            }}
          />
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 flex flex-col p-6 overflow-y-auto pb-24">
        {/* English word */}
        <div className="flex flex-col items-center justify-center py-8 animate-fade-in-up">
          <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] text-center mb-4 tracking-tight">
            {currentQuestion?.word.english}
          </h1>

          {/* Tough word chip */}
          {currentQuestion?.word.isFavorite && (
            <div className="chip chip-tough mb-4">
              <Flag className="w-4 h-4 fill-current" />
              <span>苦手な単語</span>
            </div>
          )}

          {/* Favorite toggle button (when not marked) */}
          {!currentQuestion?.word.isFavorite && (
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
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label="苦手にマーク"
            >
              <Flag className="w-5 h-5 text-[var(--color-muted)]" />
            </button>
          )}
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

        {/* Correct answer feedback overlay */}
        {isRevealed && selectedIndex === currentQuestion?.correctIndex && (
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-40">
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center animate-bounce-in">
              <Check className="w-14 h-14 text-white" strokeWidth={3} />
            </div>
          </div>
        )}

        {/* Wrong answer feedback - show correct answer */}
        {isRevealed && selectedIndex !== currentQuestion?.correctIndex && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl max-w-lg mx-auto w-full">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">正解</p>
            <p className="text-lg font-bold text-red-700 dark:text-red-300">{currentQuestion?.word.japanese}</p>
          </div>
        )}

        {/* Example sentence (shown after answering, Pro feature) */}
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

      {/* Fixed bottom next button (shown only after wrong answer) */}
      {isRevealed && selectedIndex !== currentQuestion?.correctIndex && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-background)] p-6 safe-area-bottom z-50">
          <Button onClick={moveToNext} className="w-full max-w-lg mx-auto flex" size="lg">
            続ける
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
