'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { QuizOption } from '@/components/quiz';
import { InlineFlashcard } from '@/components/home/InlineFlashcard';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { calculateNextReview, getWordsDueForReview } from '@/lib/spaced-repetition';
import { loadCollectionWords } from '@/lib/collection-words';
import { useAuth } from '@/hooks/use-auth';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { getGuestUserId } from '@/lib/utils';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

const DEFAULT_QUESTION_COUNT = 10;
const MAX_NORMAL_QUIZ_QUESTION_COUNT = 20;
const DISTRACTOR_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Session storage key for quiz state persistence
const getQuizStorageKey = (projectId: string, reviewMode: boolean) => 
  `quiz_state_${reviewMode ? 'review' : projectId}`;

interface QuizPersistState {
  questions: QuizQuestion[];
  currentIndex: number;
  selectedIndex: number | null;
  isRevealed: boolean;
  results: { correct: number; total: number };
  questionCount: number;
  quizDirection: 'en-to-ja' | 'ja-to-en';
  timestamp: number;
}

const QUIZ_STATE_TTL = 30 * 60 * 1000; // 30 minutes

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
  const collectionId = searchParams.get('collectionId');
  const [questionCount, setQuestionCount] = useState<number | null>(() => {
    if (!countFromUrl) return DEFAULT_QUESTION_COUNT;
    const parsed = Number.parseInt(countFromUrl, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUESTION_COUNT;
  });

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
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);
  const needsDistractors = useCallback((w: Word) => {
    const missingDistractors =
      !w.distractors || w.distractors.length === 0 ||
      (w.distractors.length === 3 && w.distractors[0] === '選択肢1');
    const missingExample = !w.exampleSentence || w.exampleSentence.trim().length === 0;
    return missingDistractors || missingExample;
  }, []);

  // Track if state was restored from session storage
  const restoredFromStorage = useRef(false);
  const storageKey = getQuizStorageKey(projectId, reviewMode);

  // Save quiz state to sessionStorage
  const saveQuizState = useCallback(() => {
    if (questions.length === 0 || !questionCount) return;
    
    const state: QuizPersistState = {
      questions,
      currentIndex,
      selectedIndex,
      isRevealed,
      results,
      questionCount,
      quizDirection,
      timestamp: Date.now(),
    };
    
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save quiz state:', e);
    }
  }, [questions, currentIndex, selectedIndex, isRevealed, results, questionCount, quizDirection, storageKey]);

  // Clear quiz state from sessionStorage
  const clearQuizState = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch (e) {
      console.error('Failed to clear quiz state:', e);
    }
  }, [storageKey]);

  // Save state when it changes (debounced via effect)
  useEffect(() => {
    if (questions.length > 0 && questionCount && !isComplete) {
      saveQuizState();
    }
  }, [questions, currentIndex, selectedIndex, isRevealed, results, questionCount, quizDirection, isComplete, saveQuizState]);

  // Save state when page becomes hidden (user switches apps)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && questions.length > 0 && !isComplete) {
        saveQuizState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [saveQuizState, questions.length, isComplete]);

  // Clear state when quiz is completed
  useEffect(() => {
    if (isComplete) {
      clearQuizState();
    }
  }, [isComplete, clearQuizState]);

  // Helper: apply generated examples to local state
  const applyExamples = useCallback((examples: { wordId: string; exampleSentence: string; exampleSentenceJa: string }[]) => {
    if (examples.length === 0) return;
    const exampleMap = new Map(examples.map(e => [e.wordId, e]));

    setQuestions(prev => prev.map(q => {
      const ex = exampleMap.get(q.word.id);
      return ex ? { ...q, word: { ...q.word, exampleSentence: ex.exampleSentence, exampleSentenceJa: ex.exampleSentenceJa } } : q;
    }));
    setAllWords(prev => prev.map(w => {
      const ex = exampleMap.get(w.id);
      return ex ? { ...w, exampleSentence: ex.exampleSentence, exampleSentenceJa: ex.exampleSentenceJa } : w;
    }));

    // Also save to local IndexedDB for free users
    if (!isPro) {
      examples.forEach(ex => {
        repository.updateWord(ex.wordId, {
          exampleSentence: ex.exampleSentence,
          exampleSentenceJa: ex.exampleSentenceJa,
        }).catch(() => {}); // silently ignore save errors
      });
    }
  }, [isPro, repository]);

  // Generate example sentence for a single word on-demand
  const generateExampleOnDemand = useCallback(async (word: Word) => {
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

      const data = await response.json();
      if (data.examples && data.examples.length > 0) {
        applyExamples(data.examples);
      }
    } catch (error) {
      console.error('Failed to generate example:', error);
    } finally {
      setGeneratingExample(false);
    }
  }, [applyExamples]);


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
    setDistractorError(null);

    if (quizDirection === 'ja-to-en') {
      const jaToEnQuestions = generateQuestions(selected, selected.length, quizDirection);
      setQuestions(jaToEnQuestions);
      return;
    }

    const wordsToGenerate = selected.filter((w) => needsDistractors(w));
    const distractorMap = new Map<string, string[]>();
    const exampleMap = new Map<string, { exampleSentence: string; exampleSentenceJa: string }>();

    if (wordsToGenerate.length > 0) {
      setGeneratingDistractors(true);
      let pendingWords = wordsToGenerate;

      try {
        for (let attempt = 1; attempt <= DISTRACTOR_MAX_ATTEMPTS && pendingWords.length > 0; attempt += 1) {
          try {
            const response = await fetch('/api/generate-quiz-distractors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                words: pendingWords.map((w) => ({
                  id: w.id,
                  english: w.english,
                  japanese: w.japanese,
                })),
              }),
            });

            const data = await response.json();
            if (!response.ok || !data.success || !Array.isArray(data.results)) {
              throw new Error(data?.error || 'failed to generate quiz distractors');
            }

            const succeededIds = new Set<string>();
            for (const result of data.results) {
              if (!result?.wordId || !Array.isArray(result.distractors) || result.distractors.length === 0) continue;
              distractorMap.set(result.wordId, result.distractors);
              succeededIds.add(result.wordId);
              if (result.exampleSentence) {
                exampleMap.set(result.wordId, {
                  exampleSentence: result.exampleSentence,
                  exampleSentenceJa: result.exampleSentenceJa || '',
                });
              }
            }

            pendingWords = pendingWords.filter((word) => !succeededIds.has(word.id));
            if (pendingWords.length > 0 && attempt < DISTRACTOR_MAX_ATTEMPTS) {
              await sleep(250 * attempt);
            }
          } catch (error) {
            console.error(`Failed to generate distractors (attempt ${attempt}/${DISTRACTOR_MAX_ATTEMPTS}):`, error);
            if (attempt < DISTRACTOR_MAX_ATTEMPTS) {
              await sleep(250 * attempt);
            }
          }
        }
      } finally {
        setGeneratingDistractors(false);
      }

      if (distractorMap.size > 0) {
        const updatePromises: Promise<void>[] = [];
        for (const [wordId, distractors] of distractorMap.entries()) {
          const updates: Record<string, unknown> = { distractors };
          const example = exampleMap.get(wordId);
          if (example) {
            updates.exampleSentence = example.exampleSentence;
            updates.exampleSentenceJa = example.exampleSentenceJa;
          }
          updatePromises.push(repository.updateWord(wordId, updates));
        }

        try {
          await Promise.all(updatePromises);
        } catch (error) {
          console.error('Failed to persist generated distractors:', error);
        }

        setAllWords((prev) =>
          prev.map((w) => {
            const newDistractors = distractorMap.get(w.id);
            const newExample = exampleMap.get(w.id);
            return {
              ...w,
              ...(newDistractors ? { distractors: newDistractors } : {}),
              ...(newExample && (!w.exampleSentence || w.exampleSentence.trim().length === 0) ? {
                exampleSentence: newExample.exampleSentence,
                exampleSentenceJa: newExample.exampleSentenceJa,
              } : {}),
            };
          })
        );
      }
    }

    const updatedSelected = selected.map((w) => {
      const newDistractors = distractorMap.get(w.id);
      const newExample = exampleMap.get(w.id);
      return {
        ...w,
        ...(newDistractors ? { distractors: newDistractors } : {}),
        ...(newExample && (!w.exampleSentence || w.exampleSentence.trim().length === 0) ? {
          exampleSentence: newExample.exampleSentence,
          exampleSentenceJa: newExample.exampleSentenceJa,
        } : {}),
      };
    });

    const finalWords = updatedSelected.filter((w) => !needsDistractors(w));
    if (finalWords.length < count) {
      const selectedIds = new Set(finalWords.map((word) => word.id));
      const topUpCandidates = shuffleArray(words).filter(
        (word) => !selectedIds.has(word.id) && !needsDistractors(word)
      );

      for (const word of topUpCandidates) {
        if (finalWords.length >= count) break;
        finalWords.push(word);
      }
    }

    const finalCount = Math.min(count, finalWords.length);
    if (finalCount <= 0) {
      setDistractorError('クイズに必要な選択肢を生成できませんでした。時間をおいて再試行してください。');
      return;
    }

    if (finalCount < count) {
      setQuestionCount(finalCount);
    }

    const quizQuestions = generateQuestions(finalWords, finalCount, quizDirection);
    setQuestions(quizQuestions);
  }, [generateQuestions, needsDistractors, quizDirection, repository]);

  useEffect(() => {
    if (authLoading) return;

    // Try to restore state from sessionStorage first
    const tryRestoreState = (): boolean => {
      if (restoredFromStorage.current) return false;
      
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (!saved) return false;

        const state: QuizPersistState = JSON.parse(saved);
        
        // Check if state is expired (30 minutes)
        if (Date.now() - state.timestamp > QUIZ_STATE_TTL) {
          sessionStorage.removeItem(storageKey);
          return false;
        }

        // Validate state
        if (!state.questions || state.questions.length === 0) return false;

        const restoredCount = Math.max(
          1,
          Math.min(
            state.questionCount || state.questions.length,
            state.questions.length,
            MAX_NORMAL_QUIZ_QUESTION_COUNT,
          ),
        );
        const restoredQuestions = state.questions.slice(0, restoredCount);

        // Restore state
        setQuestions(restoredQuestions);
        setCurrentIndex(Math.min(state.currentIndex, Math.max(0, restoredQuestions.length - 1)));
        setSelectedIndex(state.selectedIndex);
        setIsRevealed(state.isRevealed);
        setResults(state.results);
        setQuestionCount(restoredCount);
        setQuizDirection(state.quizDirection);
        
        // Extract allWords from questions
        const words = restoredQuestions.map(q => q.word);
        setAllWords(words);
        
        restoredFromStorage.current = true;
        setLoading(false);
        return true;
      } catch (e) {
        console.error('Failed to restore quiz state:', e);
        sessionStorage.removeItem(storageKey);
        return false;
      }
    };

    // If state was restored, skip loading
    if (tryRestoreState()) {
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

          // Skip remote check when offline - trust local data
          if (!navigator.onLine) return true;

          if (user) {
            try {
              const remoteProject = await remoteRepository.getProject(projectId);
              return remoteProject?.userId === ownerUserId;
            } catch (error) {
              console.error('Project ownership check failed (remote):', error);
              return true;
            }
          }

          return false;
        };

        let sourceWords: Word[] = [];

        if (reviewMode) {
          const userId = user ? user.id : getGuestUserId();
          let projects = await repository.getProjects(userId);
          let wordRepo = repository;

          // Fallback: If hybrid/local returned empty but user is logged in and online,
          // try remote directly (handles pre-sync state)
          if (projects.length === 0 && user && navigator.onLine) {
            try {
              projects = await remoteRepository.getProjects(user.id);
              if (projects.length > 0) {
                wordRepo = remoteRepository;
              }
            } catch (e) {
              console.error('Remote project fallback failed:', e);
            }
          }

          const projectIds = projects.map((project) => project.id);
          if (projectIds.length === 0) {
            backToProject();
            return;
          }

          // Load all words across projects
          const repoWithBulk = wordRepo as typeof repository & {
            getAllWordsByProjectIds?: (ids: string[]) => Promise<Record<string, Word[]>>;
            getAllWordsByProject?: (ids: string[]) => Promise<Record<string, Word[]>>;
          };

          let wordsByProject: Record<string, Word[]>;
          if (repoWithBulk.getAllWordsByProjectIds) {
            wordsByProject = await repoWithBulk.getAllWordsByProjectIds(projectIds);
          } else if (repoWithBulk.getAllWordsByProject) {
            wordsByProject = await repoWithBulk.getAllWordsByProject(projectIds);
          } else {
            const wordsArrays = await Promise.all(projectIds.map((id) => wordRepo.getWords(id)));
            wordsByProject = Object.fromEntries(projectIds.map((id, index) => [id, wordsArrays[index] ?? []]));
          }

          const mergedWords = projectIds.flatMap((id) => wordsByProject[id] ?? []);
          sourceWords = getWordsDueForReview(mergedWords);
        } else if (collectionId) {
          // Collection mode: load words from all projects in the collection
          sourceWords = await loadCollectionWords(collectionId);
        } else {
          const hasAccess = await ensureProjectAccess();
          if (!hasAccess) {
            backToProject();
            return;
          }

          let loadedWords = await repository.getWords(projectId);

          // If local is empty and user is logged in and online, try remote
          if (loadedWords.length === 0 && user && navigator.onLine) {
            try {
              loadedWords = await remoteRepository.getWords(projectId);
            } catch (e) {
              console.error('Remote fallback failed:', e);
            }
          }

          sourceWords = loadedWords;
        }

        if (!reviewMode) {
          sourceWords = sourceWords.filter((word) => word.status !== 'mastered');
        }

        if (sourceWords.length === 0) {
          backToProject();
          return;
        }

        setAllWords(sourceWords);

        const resolvedCount = Math.max(
          1,
          Math.min(
            questionCount ?? sourceWords.length,
            sourceWords.length,
            MAX_NORMAL_QUIZ_QUESTION_COUNT,
          ),
        );
        if (questionCount !== resolvedCount) {
          setQuestionCount(resolvedCount);
        }

        if (resolvedCount) {
          // Check if any words need distractors
          const needsGeneration = sourceWords.some((w) => needsDistractors(w));

          if (needsGeneration) {
            await startQuizWithDistractors(sourceWords, resolvedCount);
          } else {
            const generated = generateQuestions(sourceWords, resolvedCount, quizDirection);
            setQuestions(generated);
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
  }, [projectId, repository, router, generateQuestions, startQuizWithDistractors, authLoading, questionCount, reviewMode, collectionId, backToProject, user, isPro, storageKey, needsDistractors]);

  // Phase 2: Fetch latest from remote in background (Pro users)
  // Updates allWords if remote has more words than local
  useEffect(() => {
    if (authLoading || !user || reviewMode || collectionId) return;

    const syncRemote = async () => {
      try {
        const remoteWords = await remoteRepository.getWords(projectId);
        const pendingRemoteWords = remoteWords.filter((word) => word.status !== 'mastered');
        if (pendingRemoteWords.length > 0) {
          setAllWords(prev => {
            // Only update if remote has more words
            if (pendingRemoteWords.length > prev.length) return pendingRemoteWords;
            return prev;
          });
        }
      } catch (e) {
        // Silent fail - local data is already displayed
      }
    };

    syncRemote();
  }, [authLoading, user, projectId, reviewMode, collectionId]);

  const currentQuestion = questions[currentIndex];

  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const isCorrect = index === currentQuestion.correctIndex;
    const word = currentQuestion.word;

    // Generate example on-demand if not present
    if (!word.exampleSentence || word.exampleSentence.trim().length === 0) {
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
    // Clear old state before restarting
    clearQuizState();

    const count = Math.max(
      1,
      Math.min(
        questionCount ?? allWords.length ?? DEFAULT_QUESTION_COUNT,
        allWords.length || DEFAULT_QUESTION_COUNT,
        MAX_NORMAL_QUIZ_QUESTION_COUNT,
      ),
    );

    // Check if any words still need distractors
    const needsGeneration = allWords.some((w) => needsDistractors(w));

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
      const needsGeneration = allWords.some((w) => needsDistractors(w));

      if (needsGeneration) {
        // Offline check: can't generate without internet
        if (!isOnline) {
          setDistractorError('オフラインではクイズを生成できません。インターネット接続を確認してください。');
          return;
        }
        await startQuizWithDistractors(allWords, count);
      } else {
        const generated = generateQuestions(allWords, count, quizDirection);
        setQuestions(generated);
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
        <header className="sticky top-0 flex-shrink-0 p-4">
          <button
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
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
        <header className="sticky top-0 flex-shrink-0 p-4">
          <button
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
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
                <Icon name="refresh" size={20} className="mr-2" />
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
    const maxQuestions = Math.min(allWords.length, MAX_NORMAL_QUIZ_QUESTION_COUNT);
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
        <header className="sticky top-0 flex-shrink-0 p-4">
          <button
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
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
        <header className="sticky top-0 p-4">
          <button
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>
        </header>

        {/* Results */}
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="card p-8 w-full max-w-sm text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="emoji_events" size={40} className="text-[var(--color-success)]" />
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

  // Main quiz screen
  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      {/* Header */}
      <header className="sticky top-0 flex-shrink-0 p-4 flex items-center gap-4">
        <button
          onClick={backToProject}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <Icon name="close" size={24} />
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

      {/* Question area - scrollable only when content overflows */}
      <main className="flex-1 flex flex-col min-h-0 px-6 overflow-y-auto">
        {/* Mode badge */}
        <div className="flex justify-center mb-1 flex-shrink-0">
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            {quizDirection === 'en-to-ja' ? '英→日' : '日→英'}
          </span>
        </div>

        {/* Question word */}
        <div className="flex flex-col items-center justify-center py-4 flex-shrink-0 animate-fade-in-up">
          <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] text-center mb-2 tracking-tight">
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors ${
              currentQuestion?.word.isFavorite
                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                : 'hover:bg-black/5 dark:hover:bg-white/10 text-[var(--color-muted)]'
            }`}
            aria-label={currentQuestion?.word.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Icon name="flag" size={20} filled={currentQuestion?.word.isFavorite ?? false} />
            {currentQuestion?.word.isFavorite && (
              <span className="text-sm font-medium">苦手</span>
            )}
          </button>
        </div>

        {/* Options */}
        <div className="space-y-2.5 max-w-lg mx-auto w-full flex-shrink-0">
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

        {/* Example sentence shown after answering */}
        {isRevealed && currentQuestion && (
          <div className="max-w-lg mx-auto w-full mt-3 flex-shrink-0">
            {currentQuestion.word.exampleSentence ? (
              <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] font-semibold mb-1">
                  <Icon name="format_quote" size={14} />
                  例文
                </div>
                <p className="text-sm text-[var(--color-foreground)] leading-relaxed">{currentQuestion.word.exampleSentence}</p>
                {currentQuestion.word.exampleSentenceJa && (
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed">{currentQuestion.word.exampleSentenceJa}</p>
                )}
              </div>
            ) : generatingExample ? (
              <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 flex items-center gap-2 text-[var(--color-muted)]">
                <Icon name="progress_activity" size={16} className="animate-spin" />
                <span className="text-xs">例文を生成中...</span>
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* Bottom next button (shown after answering) */}
      {isRevealed && (
        <div className="flex-shrink-0 bg-[var(--color-background)] px-6 pt-3 pb-6 safe-area-bottom">
          <Button
            onClick={moveToNext}
            disabled={isTransitioning}
            className="w-full max-w-lg mx-auto flex"
            size="lg"
          >
            次へ
            <Icon name="chevron_right" size={20} className="ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
