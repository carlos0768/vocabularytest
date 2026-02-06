'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { X, ChevronRight, Trophy, RotateCcw, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuizOption } from '@/components/quiz';
import { InlineFlashcard } from '@/components/home/InlineFlashcard';
import { getRepository } from '@/lib/db';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { calculateNextReview, getWordsDueForReview } from '@/lib/spaced-repetition';
import { useAuth } from '@/hooks/use-auth';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { getGuestUserId } from '@/lib/utils';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

const DEFAULT_QUESTION_COUNT = 10;

export default function QuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading, user } = useAuth();
  const isOnline = useOnlineStatus();

  // Get question count from URL or show selection screen
  const countFromUrl = searchParams.get('count');
  const returnPath = searchParams.get('from');
  const reviewMode = searchParams.get('review') === '1';
  const [questionCount, setQuestionCount] = useState<number | null>(
    countFromUrl ? parseInt(countFromUrl, 10) : null
  );

  const backToProject = useCallback(() => {
    router.push(returnPath || `/project/${projectId}`);
  }, [router, returnPath, projectId]);

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
  const [isTransitioning, setIsTransitioning] = useState(false); // 連打防止
  const [quizDirection, setQuizDirection] = useState<'en-to-ja' | 'ja-to-en'>('en-to-ja');
  const [generatingExample, setGeneratingExample] = useState(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const isPro = subscriptionStatus === 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Generate example sentence for a single word on-demand (Pro only)
  const generateExampleOnDemand = useCallback(async (word: Word) => {
    if (!isPro) return;
    if (word.exampleSentence && word.exampleSentence.trim().length > 0) return;

    setGeneratingExample(true);
    try {
      const response = await fetch('/api/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: [{
            id: word.id,
            english: word.english,
            japanese: word.japanese,
          }],
        }),
      });

      if (!response.ok) {
        console.error('Failed to generate example:', response.status);
        return;
      }

      // Refresh the specific word to get the generated example
      const updatedWords = await repository.getWords(projectId);
      const updatedWord = updatedWords.find(w => w.id === word.id);
      
      if (updatedWord) {
        // Update questions with new example sentence
        setQuestions(prev => prev.map(q => 
          q.word.id === word.id ? { ...q, word: updatedWord } : q
        ));
        setAllWords(prev => prev.map(w => 
          w.id === word.id ? updatedWord : w
        ));
      }
    } catch (error) {
      console.error('Failed to generate example:', error);
    } finally {
      setGeneratingExample(false);
    }
  }, [isPro, projectId, repository]);

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

  const generateQuestions = useCallback((words: Word[], count: number, direction: 'en-to-ja' | 'ja-to-en' = 'en-to-ja'): QuizQuestion[] => {
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
      if (quizDirection === 'ja-to-en') {
        // Japanese → English: use other English words as distractors
        const otherWords = allWords.filter(w => w.id !== word.id);
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

    setQuestions(quizQuestions);

    // Generate example sentences in background (Pro only)
    generateExamplesInBackground(updatedSelected);
  // Note: allWords is intentionally excluded - we use the 'words' parameter passed to this function
  // quizDirection is accessed via closure but changes don't need to recreate this function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, generateExamplesInBackground]);

  useEffect(() => {
    if (authLoading) return;

    const loadWords = async () => {
      try {
        let sourceWords: Word[] = [];

        if (reviewMode) {
          const userId = isPro && user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const projectIds = projects.map((project) => project.id);
          if (projectIds.length === 0) {
            backToProject();
            return;
          }

          const repoWithBulk = repository as typeof repository & {
            getAllWordsByProjectIds?: (ids: string[]) => Promise<Record<string, Word[]>>;
            getAllWordsByProject?: (ids: string[]) => Promise<Record<string, Word[]>>;
          };

          let wordsByProject: Record<string, Word[]>;
          if (repoWithBulk.getAllWordsByProjectIds) {
            wordsByProject = await repoWithBulk.getAllWordsByProjectIds(projectIds);
          } else if (repoWithBulk.getAllWordsByProject) {
            wordsByProject = await repoWithBulk.getAllWordsByProject(projectIds);
          } else {
            const wordsArrays = await Promise.all(projectIds.map((id) => repository.getWords(id)));
            wordsByProject = Object.fromEntries(projectIds.map((id, index) => [id, wordsArrays[index] ?? []]));
          }

          const mergedWords = projectIds.flatMap((id) => wordsByProject[id] ?? []);
          sourceWords = getWordsDueForReview(mergedWords);
        } else {
          const loadedWords = await repository.getWords(projectId);
          sourceWords = loadedWords;
        }

        if (sourceWords.length === 0) {
          backToProject();
          return;
        }

        setAllWords(sourceWords);

        if (questionCount) {
          // Check if any words might need distractors
          const needsGeneration = sourceWords.some(
            (w) => !w.distractors || w.distractors.length === 0 ||
              (w.distractors.length === 3 && w.distractors[0] === '選択肢1')
          );

          if (needsGeneration) {
            await startQuizWithDistractors(sourceWords, questionCount);
          } else {
            const generated = generateQuestions(sourceWords, questionCount, quizDirection);
            setQuestions(generated);
            // Generate example sentences in background (Pro only)
            const selectedWords = generated.map(q => q.word);
            generateExamplesInBackground(selectedWords);
          }
        }
      } catch (error) {
        console.error('Failed to load words:', error);
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, startQuizWithDistractors, generateExamplesInBackground, authLoading, questionCount, reviewMode, backToProject, user, isPro]);

  const currentQuestion = questions[currentIndex];

  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;
    const word = currentQuestion.word;

    // Generate example on-demand if not present (Pro only)
    if (isPro && (!word.exampleSentence || word.exampleSentence.trim().length === 0)) {
      generateExampleOnDemand(word);
    }

    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    if (isCorrect) {
      recordCorrectAnswer(false);
    } else {
      const recordProjectId = reviewMode ? word.projectId : projectId;
      recordWrongAnswer(word.id, word.english, word.japanese, recordProjectId, word.distractors);
    }

    recordActivity();

    // Update spaced repetition fields using SM-2 algorithm
    try {
      const srUpdate = calculateNextReview(isCorrect, word);
      await repository.updateWord(word.id, srUpdate);

      // Update local state
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === currentIndex
            ? { ...q, word: { ...q.word, ...srUpdate } }
            : q
        )
      );
      setAllWords((prev) =>
        prev.map((w) =>
          w.id === word.id ? { ...w, ...srUpdate } : w
        )
      );
    } catch (error) {
      console.error('Failed to update spaced repetition:', error);
    }
  };

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
      const regenerated = generateQuestions(allWords, count, quizDirection);
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
        // Offline check: can't generate distractors without internet
        if (!isOnline) {
          setDistractorError('オフラインではクイズを生成できません。インターネット接続を確認してください。');
          return;
        }
        await startQuizWithDistractors(allWords, count);
      } else {
        const generated = generateQuestions(allWords, count, quizDirection);
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
            onClick={backToProject}
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
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <p className="text-[var(--color-error)] mb-6">{distractorError}</p>
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
            onClick={backToProject}
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

              {/* Direction toggle */}
              <div className="flex items-center justify-center">
                <div className="inline-flex rounded-full border border-[var(--color-border)] p-1 bg-[var(--color-surface)]">
                  <button
                    onClick={() => setQuizDirection('en-to-ja')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      quizDirection === 'en-to-ja'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    英→日
                  </button>
                  <button
                    onClick={() => setQuizDirection('ja-to-en')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      quizDirection === 'ja-to-en'
                        ? 'bg-[var(--color-primary)] text-white'
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
            onClick={backToProject}
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

  // Main quiz screen
  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      {/* Header */}
      <header className="flex-shrink-0 p-4 flex items-center gap-4">
        <button
          onClick={backToProject}
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
        {/* Mode badge */}
        <div className="flex justify-center mb-2">
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            {quizDirection === 'en-to-ja' ? '英→日' : '日→英'}
          </span>
        </div>

        {/* Question word */}
        <div className="flex flex-col items-center justify-center py-8 animate-fade-in-up">
          <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] text-center mb-4 tracking-tight">
            {quizDirection === 'en-to-ja' ? currentQuestion?.word.english : currentQuestion?.word.japanese}
          </h1>

          {/* Favorite toggle button - always visible */}
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
              // Also update allWords state
              setAllWords((prev) =>
                prev.map((w) =>
                  w.id === word.id ? { ...w, isFavorite: newFavorite } : w
                )
              );
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-full transition-colors ${
              currentQuestion?.word.isFavorite
                ? 'bg-[var(--color-peach-light)] text-[var(--color-peach)]'
                : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--color-muted)]'
            }`}
            aria-label={currentQuestion?.word.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Flag className={`w-5 h-5 ${currentQuestion?.word.isFavorite ? 'fill-current' : ''}`} />
            {currentQuestion?.word.isFavorite && (
              <span className="text-sm font-medium">苦手</span>
            )}
          </button>
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

        {/* Example sentence (shown after answering, Pro feature) */}
        {isRevealed && isPro && (
          <div className="mb-4 p-4 bg-[var(--color-peach-light)] rounded-2xl max-w-lg mx-auto w-full">
            <p className="text-sm font-semibold text-[var(--color-primary)] mb-1">例文</p>
            {generatingExample ? (
              <div className="flex items-center gap-2 text-[var(--color-muted)]">
                <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">例文を生成中...</span>
              </div>
            ) : currentQuestion?.word.exampleSentence ? (
              <>
                <p className="text-[var(--color-foreground)] italic">{currentQuestion.word.exampleSentence}</p>
                {currentQuestion.word.exampleSentenceJa && (
                  <p className="text-sm text-[var(--color-muted)] mt-1">{currentQuestion.word.exampleSentenceJa}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">例文を取得できませんでした</p>
            )}
          </div>
        )}
      </main>

      {/* Fixed bottom next button (shown after answering) */}
      {isRevealed && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-background)] p-6 safe-area-bottom z-50">
          <Button 
            onClick={moveToNext} 
            disabled={isTransitioning}
            className="w-full max-w-lg mx-auto flex" 
            size="lg"
          >
            次へ
            <ChevronRight className="w-5 h-5 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
