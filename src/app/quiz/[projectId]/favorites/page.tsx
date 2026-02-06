'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

const DEFAULT_QUESTION_COUNT = 10;
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30];

export default function FavoritesQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  // Get question count from URL or show selection screen
  const countFromUrl = searchParams.get('count');
  const returnPath = searchParams.get('from');
  const [questionCount, setQuestionCount] = useState<number | null>(
    countFromUrl ? parseInt(countFromUrl, 10) : null
  );

  const backToProject = () => {
    router.push(returnPath || `/project/${projectId}`);
  };

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
  const [inputCount, setInputCount] = useState(''); // User input for question count
  const [isTransitioning, setIsTransitioning] = useState(false); // 連打防止
  const [quizDirection, setQuizDirection] = useState<'en-to-ja' | 'ja-to-en'>('en-to-ja');

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

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
        let favoriteWords: Word[];

        if (projectId === 'all') {
          // 全プロジェクト横断でお気に入り単語を取得
          const userId = isPro && user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const allWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
          favoriteWords = allWords.flat().filter(w => w.isFavorite);
        } else {
          const words = await repository.getWords(projectId);
          favoriteWords = words.filter((w) => w.isFavorite);
        }

        if (favoriteWords.length === 0) {
          backToProject();
          return;
        }

        setAllFavoriteWords(favoriteWords); // Store all favorite words for restart

        // Only generate questions if question count is set
        if (questionCount) {
          const generated = generateQuestions(favoriteWords, questionCount, quizDirection);
          setQuestions(generated);
        }
      } catch (error) {
        console.error('Failed to load words:', error);
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, authLoading, isPro, questionCount, quizDirection]);

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
    const regenerated = generateQuestions(allFavoriteWords, questionCount || DEFAULT_QUESTION_COUNT, quizDirection);
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
    if (allFavoriteWords.length > 0) {
      const generated = generateQuestions(allFavoriteWords, count, quizDirection);
      setQuestions(generated);
    }
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
          <p className="text-[var(--color-muted)]">苦手クイズを準備中...</p>
        </div>
      </div>
    );
  }

  // Question count selection screen
  if (!questionCount) {
    const maxQuestions = allFavoriteWords.length;
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
        <header className="flex-shrink-0 p-4 flex items-center justify-between">
          <button
            onClick={backToProject}
            className="p-2 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
          >
            <Icon name="close" size={24} />
          </button>
          <div className="flex items-center gap-2 bg-[var(--color-warning-light)] px-3 py-1 rounded-full">
            <Icon name="flag" size={16} filled className="text-[var(--color-warning)]" />
            <span className="text-sm font-medium text-[var(--color-warning)]">苦手クイズ</span>
          </div>
          <div className="w-10" /> {/* Spacer for alignment */}
        </header>

        {/* Selection */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-[var(--color-foreground)] text-center mb-2">
              問題数を入力
            </h1>
            <p className="text-[var(--color-muted)] text-center mb-8">
              1〜{maxQuestions}問まで
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2">
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
                  className="w-24 text-center text-3xl font-bold px-4 py-3 border-2 border-[var(--color-border)] rounded-xl focus:border-[var(--color-warning)] focus:outline-none transition-colors"
                  autoFocus
                />
                <span className="text-xl text-[var(--color-muted)]">問</span>
              </div>

              {/* Direction toggle */}
              <div className="flex items-center justify-center">
                <div className="inline-flex rounded-full border border-[var(--color-border)] p-1 bg-[var(--color-surface)]">
                  <button
                    onClick={() => setQuizDirection('en-to-ja')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      quizDirection === 'en-to-ja'
                        ? 'bg-[var(--color-warning)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    英→日
                  </button>
                  <button
                    onClick={() => setQuizDirection('ja-to-en')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      quizDirection === 'ja-to-en'
                        ? 'bg-[var(--color-warning)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    日→英
                  </button>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!isValidInput}
                className="w-full bg-[var(--color-warning)] hover:bg-[var(--color-warning)]/90"
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
              苦手クイズ完了！
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
                ? '苦手を克服！素晴らしい！'
                : percentage >= 80
                ? 'よくできました！もう少しで克服！'
                : percentage >= 60
                ? '頑張りました！繰り返し練習しましょう'
                : '苦手は繰り返しが大事！もう一度！'}
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
      <header className="flex-shrink-0 p-4 flex items-center justify-between">
        <button
          onClick={backToProject}
          className="p-2 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
        >
          <Icon name="close" size={24} />
        </button>

        {/* Title badge */}
        <div className="flex items-center gap-2 bg-[var(--color-warning-light)] px-3 py-1 rounded-full">
          <Icon name="flag" size={16} filled className="text-[var(--color-warning)]" />
          <span className="text-sm font-medium text-[var(--color-warning)]">苦手クイズ</span>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--color-muted)]">
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
      </header>

      {/* Question */}
      <main className="flex-1 flex flex-col p-6 min-h-0 overflow-hidden">
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
            aria-label={currentQuestion?.word.isFavorite ? '苦手を解除' : '苦手にマーク'}
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
      </main>
    </div>
  );
}
