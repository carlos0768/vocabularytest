'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

const DEFAULT_QUESTION_COUNT = 10;

function parseFavoriteQuizQuestionCount(value: string | null): number {
  if (!value) return DEFAULT_QUESTION_COUNT;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUESTION_COUNT;
}

export default function FavoritesQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const countFromUrl = searchParams.get('count');
  const returnPath = searchParams.get('from');
  const [questionCount] = useState<number>(
    () => parseFavoriteQuizQuestionCount(countFromUrl)
  );

  const backToProject = useCallback(() => {
    router.replace(returnPath || `/project/${projectId}`);
  }, [router, returnPath, projectId]);

  const [allFavoriteWords, setAllFavoriteWords] = useState<Word[]>([]); // Store all favorite words for restart
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
  const [isTransitioning, setIsTransitioning] = useState(false); // 連打防止
  const quizDirection: 'en-to-ja' | 'ja-to-en' = 'en-to-ja';

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  // Generate quiz questions from favorite words only
  const generateQuestions = useCallback((words: Word[], count: number, direction: 'en-to-ja' | 'ja-to-en' = 'en-to-ja'): QuizQuestion[] => {
    // Take up to count questions per session
    const selected = shuffleArray(words).slice(0, count);

    return selected.map((word) => {
      if (direction === 'ja-to-en') {
        // Japanese → English: use other English words as distractors
        const otherWords = words.filter(w => w.id !== word.id);
        const englishDistractors = shuffleArray(otherWords)
          .slice(0, 3)
          .map(w => w.english);
        const allOptions = [word.english, ...englishDistractors];
        const shuffled = shuffleArray(allOptions);
        const correctIndex = shuffled.indexOf(word.english);

        return {
          word,
          options: shuffled,
          correctIndex,
        };
      } else {
        // English → Japanese: use pre-generated Japanese distractors
        const allOptions = [word.japanese, ...word.distractors];
        const shuffled = shuffleArray(allOptions);
        const correctIndex = shuffled.indexOf(word.japanese);

        return {
          word,
          options: shuffled,
          correctIndex,
        };
      }
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
        const ensureProjectAccess = async (): Promise<boolean> => {
          const ownerUserId = user ? user.id : getGuestUserId();

          try {
            const localProject = await repository.getProject(projectId);
            if (localProject?.userId === ownerUserId) {
              return true;
            }
          } catch (error) {
            console.error('Project ownership check failed (local):', error);
          }

          if (user) {
            try {
              const remoteProject = await remoteRepository.getProject(projectId);
              return remoteProject?.userId === ownerUserId;
            } catch (error) {
              console.error('Project ownership check failed (remote):', error);
            }
          }

          return false;
        };

        let favoriteWords: Word[];

        if (projectId === 'all') {
          // 全単語帳横断でお気に入り単語を取得
          const userId = user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const allWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
          favoriteWords = allWords.flat().filter(w => w.isFavorite);
        } else {
          const hasAccess = await ensureProjectAccess();
          if (!hasAccess) {
            backToProject();
            return;
          }
          const words = await repository.getWords(projectId);
          favoriteWords = words.filter((w) => w.isFavorite);
        }

        if (favoriteWords.length === 0) {
          backToProject();
          return;
        }

        setAllFavoriteWords(favoriteWords); // Store all favorite words for restart

        const generated = generateQuestions(favoriteWords, questionCount, quizDirection);
        setQuestions(generated);
      } catch (error) {
        console.error('Failed to load words:', error);
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, authLoading, isPro, questionCount, quizDirection, user, backToProject]);

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

    // Advance is controlled by the Next button to avoid skipping too fast
  };

  // Move to next question
  const moveToNext = () => {
    if (isTransitioning) return; // 連打防止
    setIsTransitioning(true);
    
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setIsRevealed(false);
      setIsTransitioning(false); // 次の問題に移ったらリセット
    }
  };

  // Restart quiz with new random questions from all favorite words
  const handleRestart = () => {
    // Use allFavoriteWords to get completely new random questions
    const regenerated = generateQuestions(allFavoriteWords, questionCount, quizDirection);
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
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-warning)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">保存済みクイズを準備中...</p>
        </div>
      </div>
    );
  }

  // Quiz complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);

    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 p-4">
          <button
            onClick={backToProject}
            className="p-2 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
          >
            <Icon name="close" size={24} />
          </button>
        </header>

        {/* Results */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-2xl)] shadow-card p-8 w-full max-w-sm text-center border border-[var(--color-border)]">
            <div className="w-20 h-20 bg-[var(--color-warning-light)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="emoji_events" size={40} className="text-[var(--color-warning)]" />
            </div>

            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
              保存済みクイズ完了！
            </h1>

            <div className="mb-6">
              <p className="text-5xl font-bold text-[var(--color-warning)] mb-1">
                {percentage}%
              </p>
              <p className="text-[var(--color-muted)]">
                {results.total}問中 {results.correct}問正解
              </p>
            </div>

            {/* Performance message */}
            <p className="text-[var(--color-muted)] mb-8">
              {percentage === 100
                ? '全問正解！素晴らしい！'
                : percentage >= 80
                ? 'よくできました！'
                : percentage >= 60
                ? '頑張りました！繰り返し練習しましょう'
                : '保存した単語をもう一度確認しましょう'}
            </p>

            <div className="space-y-3">
              <Button onClick={handleRestart} className="w-full bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/90" size="lg">
                <Icon name="refresh" size={20} className="mr-2" />
                もう一度
              </Button>
              <Button
                variant="secondary"
                onClick={backToProject}
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
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 flex-shrink-0 py-4 px-6 w-full">
        <div className="mx-auto w-full max-w-lg flex items-center justify-between gap-3">
          <button
            onClick={backToProject}
            className="p-2 shrink-0 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
          >
            <Icon name="close" size={24} />
          </button>

          {/* Title badge */}
          <div className="flex items-center gap-2 bg-[var(--color-warning-light)] px-3 py-1 rounded-full min-w-0">
            <Icon name="flag" size={16} filled className="text-[var(--color-warning)] shrink-0" />
            <span className="text-sm font-medium text-[var(--color-warning)] truncate">保存済みクイズ</span>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-[var(--color-muted)] tabular-nums">
              {currentIndex + 1} / {questions.length}
            </span>
            <div className="w-24 h-2 bg-[var(--color-border-light)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-warning)] transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / questions.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Question */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
        <div className="mx-auto w-full max-w-lg px-6 py-6 flex flex-col flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* Mode badge */}
        <div className="flex justify-center mb-2">
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning)]">
            {quizDirection === 'en-to-ja' ? '英→日' : '日→英'}
          </span>
        </div>

        {/* Question word */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center py-4">
          <h1 className="text-4xl font-bold text-[var(--color-foreground)] text-center mb-4">
            {quizDirection === 'en-to-ja' ? currentQuestion?.word.english : currentQuestion?.word.japanese}
          </h1>
          {/* Favorite button */}
          <button
            onClick={handleToggleFavorite}
            className="p-2 rounded-full hover:bg-[var(--color-primary-light)] transition-colors"
            aria-label={currentQuestion?.word.isFavorite ? '保存済みから外す' : '保存済みに追加'}
          >
            <Icon
              name="flag"
              size={24}
              filled={currentQuestion?.word.isFavorite}
              className={`transition-colors ${
                currentQuestion?.word.isFavorite
                  ? 'text-[var(--color-warning)]'
                  : 'text-[var(--color-muted)]'
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
          <div className="flex-shrink-0 mb-4 p-4 bg-[var(--color-warning-light)] rounded-[var(--radius-lg)]">
            <p className="text-sm font-medium text-[var(--color-foreground)] mb-1">例文</p>
            <p className="text-[var(--color-foreground)] italic">{currentQuestion.word.exampleSentence}</p>
            {currentQuestion.word.exampleSentenceJa && (
              <p className="text-sm text-[var(--color-warning)] mt-1">{currentQuestion.word.exampleSentenceJa}</p>
            )}
          </div>
        )}

        {/* Next button (shown after answering) */}
        {isRevealed && (
          <Button 
            onClick={moveToNext} 
            disabled={isTransitioning}
            className="flex-shrink-0 w-full bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/90" 
            size="lg"
          >
            次へ
            <Icon name="chevron_right" size={20} className="ml-1" />
          </Button>
        )}
        </div>
      </main>
    </div>
  );
}
