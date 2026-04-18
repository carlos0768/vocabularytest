'use client';

import { type ReactNode, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { DesktopAdFrame } from '@/components/ads/DesktopAdFrame';
import { QuizOption, TypeInQuizField } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity, getGuestUserId } from '@/lib/utils';
import { calculateNextReview, getStatusAfterAnswer, getWordsDueForReview, sortWordsByPriority } from '@/lib/spaced-repetition';
import { loadCollectionWords } from '@/lib/collection-words';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

const DEFAULT_QUESTION_COUNT = 10;
const MAX_NORMAL_QUIZ_QUESTION_COUNT = 20;
const DISTRACTOR_MAX_ATTEMPTS = 3;
/** API schema max is 30; keep chunks smaller for reliability */
const DISTRACTOR_API_CHUNK_SIZE = 20;
const DISTRACTOR_FETCH_TIMEOUT_MS = 25000;

const GENERIC_JA_DISTRACTOR_POOL = [
  '確認する', '提供する', '参加する', '検討する', '対応する', '説明する', '準備する', '記録する',
] as const;

const GENERIC_EN_DISTRACTOR_POOL = [
  'consider', 'provide', 'develop', 'maintain', 'achieve', 'support', 'prepare', 'review',
] as const;

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

function QuizDesktopViewport({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-[var(--color-background)] lg:left-[280px]">
      <DesktopAdFrame
        label="クイズ"
        sticky={false}
        className="h-full"
        contentClassName="h-full min-h-0"
      >
        {children}
      </DesktopAdFrame>
    </div>
  );
}

export default function QuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading, user } = useAuth();
  const { aiEnabled, loading: userPreferencesLoading } = useUserPreferences();

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
    router.back();
  }, [router]);

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
  const [distractorError, setDistractorError] = useState<string | null>(null);
  const [inputCount, setInputCount] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [quizDirection, setQuizDirection] = useState<'en-to-ja' | 'ja-to-en'>('en-to-ja');
  const [typeInAnswer, setTypeInAnswer] = useState('');
  const [typeInResult, setTypeInResult] = useState<'correct' | 'wrong' | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const isPro = subscriptionStatus === 'active';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);
  const needsDistractors = useCallback((w: Word) => {
    const missingDistractors =
      !w.distractors || w.distractors.length === 0 ||
      (w.distractors.length === 3 && w.distractors[0] === '選択肢1');
    return missingDistractors;
  }, []);

  // Track if state was restored from session storage
  const restoredFromStorage = useRef(false);
  /** sessionStorage のスナップショットに古い vocabularyType が残る場合、IndexedDB の現物で上書きする（1 回のみ） */
  const vocabularyMergeFromLocalAppliedRef = useRef(false);
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

  /** 復習クイズ完了後: ホームではなく次の復習セッション（単語を再取得して新規クイズ）へ */
  const goToNextReviewQuiz = useCallback(() => {
    clearQuizState();
    restoredFromStorage.current = false;
    const fromQ = returnPath ? `&from=${encodeURIComponent(returnPath)}` : '';
    const cnt = Math.max(
      1,
      Math.min(questionCount ?? DEFAULT_QUESTION_COUNT, MAX_NORMAL_QUIZ_QUESTION_COUNT),
    );
    const url = `${pathname}?review=1&count=${cnt}${fromQ}&_rs=${Date.now()}`;
    window.location.assign(url);
  }, [clearQuizState, returnPath, questionCount, pathname]);

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

  const generateQuestions = useCallback((words: Word[], count: number, direction: 'en-to-ja' | 'ja-to-en' = 'en-to-ja'): QuizQuestion[] => {
    const selected = sortWordsByPriority(words).slice(0, count);

    return selected.map((word) => {
      if (direction === 'ja-to-en') {
        const correctEn = word.english.trim().toLowerCase();
        const otherWords = words.filter(w => w.id !== word.id);
        let englishDistractors = shuffleArray(otherWords)
          .map((w) => w.english)
          .filter((e) => e.trim().toLowerCase() !== correctEn);
        englishDistractors = [...new Set(englishDistractors.map((e) => e.trim()))].slice(0, 3);
        let gi = 0;
        while (englishDistractors.length < 3 && gi < GENERIC_EN_DISTRACTOR_POOL.length) {
          const g = GENERIC_EN_DISTRACTOR_POOL[gi++];
          if (g.toLowerCase() !== correctEn && !englishDistractors.includes(g)) {
            englishDistractors.push(g);
          }
        }
        while (englishDistractors.length < 3) {
          englishDistractors.push(`option${englishDistractors.length + 1}`);
        }
        englishDistractors = englishDistractors.slice(0, 3);

        const allOptions = [word.english, ...englishDistractors];
        const shuffled = shuffleArray(allOptions);
        const correctIndex = shuffled.indexOf(word.english);

        return {
          word,
          options: shuffled,
          correctIndex,
        };
      } else {
        const correctJa = word.japanese.trim().toLowerCase();
        let distractors: string[] = [...(word.distractors || [])];

        if (distractors.length === 0 || (distractors.length === 3 && distractors[0] === '選択肢1')) {
          const otherWords = words.filter((w) => w.id !== word.id);
          distractors = shuffleArray(otherWords)
            .map((w) => w.japanese)
            .filter((d) => d.trim().toLowerCase() !== correctJa);
        }

        distractors = [...new Set(distractors.map((d) => d.trim()))].filter(
          (d) => d.length > 0 && d.toLowerCase() !== correctJa,
        );

        let gi = 0;
        while (distractors.length < 3 && gi < GENERIC_JA_DISTRACTOR_POOL.length) {
          const g = GENERIC_JA_DISTRACTOR_POOL[gi++];
          if (g.toLowerCase() !== correctJa && !distractors.includes(g)) {
            distractors.push(g);
          }
        }
        while (distractors.length < 3) {
          distractors.push(`選択肢${distractors.length + 1}`);
        }
        distractors = distractors.slice(0, 3);

        const allOptions = [word.japanese, ...distractors];
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
    const selected = sortWordsByPriority(words).slice(0, count);
    setDistractorError(null);

    if (quizDirection === 'ja-to-en') {
      const jaToEnQuestions = generateQuestions(selected, selected.length, quizDirection);
      setQuestions(jaToEnQuestions);
      return;
    }

    // 英→日: AIの完了を待たずに即クイズ開始（他単語の訳＋汎用語で4択を構成）。
    // 旧実装は1リクエストで最大20語×例文・品詞まで生成しており、失敗時は finalWords が空のまま
    // エラーになり得た。AIはバックグラウンドで品質改善のみ行う。
    const quizQuestionsImmediate = generateQuestions(words, count, quizDirection);
    setQuestions(quizQuestionsImmediate);

    const toImprove = selected.filter((w) => needsDistractors(w));
    if (toImprove.length === 0) {
      return;
    }

    void (async () => {
      let pendingWords = [...toImprove];
      for (let attempt = 1; attempt <= DISTRACTOR_MAX_ATTEMPTS && pendingWords.length > 0; attempt += 1) {
        const chunk = pendingWords.slice(0, DISTRACTOR_API_CHUNK_SIZE);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), DISTRACTOR_FETCH_TIMEOUT_MS);
          let response: Response;
          try {
            response = await fetch('/api/generate-quiz-distractors', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                words: chunk.map((w) => ({
                  id: w.id,
                  english: w.english,
                  japanese: w.japanese,
                })),
              }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeoutId);
          }

          const data = await response.json();
          if (!response.ok || !data.success || !Array.isArray(data.results)) {
            throw new Error(data?.error || 'failed to generate quiz distractors');
          }

          const distractorMap = new Map<string, string[]>();
          const exampleMap = new Map<string, { exampleSentence: string; exampleSentenceJa: string }>();
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

          if (distractorMap.size > 0) {
            const updatePromises = [...distractorMap.entries()].map(([wordId, distractors]) => {
              const updates: Record<string, unknown> = { distractors };
              const example = exampleMap.get(wordId);
              if (example) {
                updates.exampleSentence = example.exampleSentence;
                updates.exampleSentenceJa = example.exampleSentenceJa;
              }
              return repository.updateWord(wordId, updates).catch((err) => {
                console.error('Background persist distractors failed:', err);
              });
            });
            await Promise.all(updatePromises);

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

          pendingWords = pendingWords.filter((word) => !succeededIds.has(word.id));
          if (pendingWords.length > 0 && attempt < DISTRACTOR_MAX_ATTEMPTS) {
            await sleep(250 * attempt);
          }
        } catch (error) {
          console.error(`Background distractor improve (attempt ${attempt}/${DISTRACTOR_MAX_ATTEMPTS}):`, error);
          if (attempt < DISTRACTOR_MAX_ATTEMPTS) {
            await sleep(250 * attempt);
          }
        }
      }
    })();
  }, [generateQuestions, needsDistractors, quizDirection, repository]);

  useEffect(() => {
    if (authLoading || userPreferencesLoading) return;
    if (aiEnabled === false) {
      setLoading(false);
      return;
    }

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

        // Prefer words that still need practice; if all are mastered, keep full list so quiz stays available.
        if (!reviewMode) {
          const nonMastered = sourceWords.filter((word) => word.status !== 'mastered');
          if (nonMastered.length > 0) {
            sourceWords = nonMastered;
          }
        }

        if (sourceWords.length === 0) {
          backToProject();
          return;
        }

        const prioritizedSourceWords = sortWordsByPriority(sourceWords);
        setAllWords(prioritizedSourceWords);

        const resolvedCount = Math.max(
          1,
          Math.min(
            questionCount ?? prioritizedSourceWords.length,
            prioritizedSourceWords.length,
            MAX_NORMAL_QUIZ_QUESTION_COUNT,
          ),
        );
        if (questionCount !== resolvedCount) {
          setQuestionCount(resolvedCount);
        }

        if (resolvedCount) {
          // Check if any words need distractors
          const needsGeneration = prioritizedSourceWords.some((w) => needsDistractors(w));

          if (needsGeneration) {
            // AIはバックグラウンドのため、ここでローディングを外す（即時クイズ表示）
            setLoading(false);
            await startQuizWithDistractors(prioritizedSourceWords, resolvedCount);
          } else {
            const generated = generateQuestions(prioritizedSourceWords, resolvedCount, quizDirection);
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
  }, [projectId, repository, router, generateQuestions, startQuizWithDistractors, authLoading, userPreferencesLoading, aiEnabled, questionCount, reviewMode, collectionId, backToProject, user, isPro, storageKey, needsDistractors]);

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
            if (pendingRemoteWords.length > prev.length) return sortWordsByPriority(pendingRemoteWords);
            return prev;
          });
        }
      } catch (e) {
        // Silent fail - local data is already displayed
      }
    };

    syncRemote();
  }, [authLoading, user, projectId, reviewMode, collectionId]);

  // 復元したクイズ状態の語彙モードを、ローカル DB の最新（ハイブリッドの真実）に合わせる
  useEffect(() => {
    if (!restoredFromStorage.current) return;
    if (reviewMode || collectionId) return;
    if (questions.length === 0) return;
    if (vocabularyMergeFromLocalAppliedRef.current) return;

    vocabularyMergeFromLocalAppliedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        const fresh = await repository.getWords(projectId);
        if (cancelled || fresh.length === 0) return;
        const byId = new Map(fresh.map((w) => [w.id, w]));

        setQuestions((prev) =>
          prev.map((q) => {
            const w = byId.get(q.word.id);
            if (!w) return q;
            const nextVt = w.vocabularyType ?? null;
            const curVt = q.word.vocabularyType ?? null;
            if (nextVt === curVt) return q;
            return { ...q, word: { ...q.word, vocabularyType: w.vocabularyType } };
          })
        );
        setAllWords((prev) =>
          prev.map((w) => {
            const nw = byId.get(w.id);
            if (!nw) return w;
            const nextVt = nw.vocabularyType ?? null;
            const curVt = w.vocabularyType ?? null;
            if (nextVt === curVt) return w;
            return { ...w, vocabularyType: nw.vocabularyType };
          })
        );
      } catch {
        vocabularyMergeFromLocalAppliedRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [questions.length, projectId, repository, reviewMode, collectionId]);

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
      const recordProjectId = reviewMode ? word.projectId : projectId;
      recordWrongAnswer(word.id, word.english, word.japanese, recordProjectId, word.distractors);
    }

    recordActivity();

    // Update status and spaced repetition fields using SM-2 algorithm
    try {
      const newStatus = getStatusAfterAnswer(word.status, isCorrect);
      const srUpdate = calculateNextReview(isCorrect, word);
      const updates = { status: newStatus, ...srUpdate };
      await repository.updateWord(word.id, updates);

      // Update local state
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === currentIndex
            ? { ...q, word: { ...q.word, ...updates } }
            : q
        )
      );
      setAllWords((prev) =>
        prev.map((w) =>
          w.id === word.id ? { ...w, ...updates } : w
        )
      );
    } catch (error) {
      console.error('Failed to update spaced repetition:', error);
    }
  };

  // Derived from the word's vocabularyType — mirrors iOS isActiveVocab
  const isActiveVocab = currentQuestion?.word.vocabularyType === 'active';

  const handleTypeInSubmit = async () => {
    if (isRevealed || !currentQuestion) return;
    
    // Active vocab: show Japanese → type English; Passive: follow quizDirection
    const correctAnswer = isActiveVocab
      ? currentQuestion.word.english
      : quizDirection === 'en-to-ja'
        ? currentQuestion.word.japanese
        : currentQuestion.word.english;
    
    const normalizedInput = typeInAnswer.trim().toLowerCase();
    const normalizedCorrect = correctAnswer.trim().toLowerCase();
    const isCorrect = normalizedInput === normalizedCorrect;
    
    setTypeInResult(isCorrect ? 'correct' : 'wrong');
    setIsRevealed(true);
    
    const word = currentQuestion.word;
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
    
    try {
      const newStatus = getStatusAfterAnswer(word.status, isCorrect);
      const srUpdate = calculateNextReview(isCorrect, word);
      const updates = { status: newStatus, ...srUpdate };
      await repository.updateWord(word.id, updates);
      
      setQuestions((prev) => prev.map((q, i) => i === currentIndex ? { ...q, word: { ...q.word, ...updates } } : q));
      setAllWords((prev) => prev.map((w) => w.id === word.id ? { ...w, ...updates } : w));
    } catch (error) {
      console.error('Failed to update spaced repetition:', error);
    }
  };

  const moveToNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setIsRevealed(false);
      setTypeInAnswer('');
      setTypeInResult(null);
      setIsTransitioning(false);
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
        // 英→日はローカルで4択を組むためオフラインでも開始可（AIはバックグラウンド）
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
      <QuizDesktopViewport>
        <div className="h-full flex items-center justify-center overflow-hidden">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[var(--color-muted)]">クイズを準備中...</p>
          </div>
        </div>
      </QuizDesktopViewport>
    );
  }

  if (aiEnabled === false) {
    return (
      <QuizDesktopViewport>
        <div className="h-full flex flex-col bg-[var(--color-background)] overflow-hidden">
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
              <p className="text-[var(--color-foreground)] font-semibold mb-2">この機能は現在OFFです</p>
              <p className="text-sm text-[var(--color-muted)] mb-6">
                設定の「ノート生成設定」でAI機能をONにすると4択クイズを使えます。
              </p>
              <Button onClick={backToProject} className="w-full" size="lg">
                ノートに戻る
              </Button>
            </div>
          </main>
        </div>
      </QuizDesktopViewport>
    );
  }

  // Distractor generation error screen
  if (distractorError) {
    return (
      <QuizDesktopViewport>
        <div className="h-full flex flex-col bg-[var(--color-background)] overflow-hidden">
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
      </QuizDesktopViewport>
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
      <QuizDesktopViewport>
        <div className="h-full flex flex-col bg-[var(--color-background)] overflow-hidden">
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
      </QuizDesktopViewport>
    );
  }

  // Quiz complete screen
  if (isComplete) {
    const percentage = Math.round((results.correct / results.total) * 100);

    return (
      <QuizDesktopViewport>
        <div className="h-full flex flex-col bg-[var(--color-background)] overflow-hidden">
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
                {reviewMode ? (
                  <>
                    <Button onClick={goToNextReviewQuiz} className="w-full" size="lg">
                      <Icon name="arrow_forward" size={20} className="mr-2" />
                      次へ進む
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleRestart}
                      className="w-full"
                      size="lg"
                    >
                      <Icon name="refresh" size={20} className="mr-2" />
                      もう一度
                    </Button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </QuizDesktopViewport>
    );
  }

  // Main quiz screen
  return (
    <QuizDesktopViewport>
      <div className="h-full flex flex-col bg-[var(--color-background)] overflow-hidden">
        {/* Header - iOS style */}
        <header className="sticky top-0 flex-shrink-0 py-4 px-6 w-full">
          <div className="mx-auto w-full max-w-lg flex items-center gap-4">
            <button
              onClick={backToProject}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-foreground)]"
            >
              <Icon name="close" size={24} />
            </button>

            <div className="flex-1 progress-bar min-w-0">
              <div
                className="progress-bar-fill"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col min-h-0 w-full overflow-y-auto">
          <div className="mx-auto w-full max-w-lg px-6 flex flex-col flex-1 min-h-0">
          {/* Mode badges - iOS style */}
          <div className="flex items-center justify-center gap-2 mb-2 flex-shrink-0">
            <span
              className={`px-3 py-1 text-xs font-medium rounded-full ${
                isActiveVocab
                  ? 'bg-[var(--color-accent-blue-light)] text-[var(--color-accent-blue)]'
                  : 'bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]'
              }`}
            >
              {isActiveVocab ? 'Active — タイプ入力' : 'Passive — 4択'}
            </span>
          </div>

          {/* Question word - iOS style */}
          <div className="flex flex-col items-center justify-center py-6 flex-shrink-0 animate-fade-in-up">
            <h1 className="text-4xl font-black text-[var(--color-foreground)] text-center mb-3 tracking-tight">
              {isActiveVocab
                ? currentQuestion?.word.japanese
                : quizDirection === 'en-to-ja'
                  ? currentQuestion?.word.english
                  : currentQuestion?.word.japanese}
            </h1>

            <button
              onClick={async () => {
                if (!currentQuestion) return;
                const word = currentQuestion.word;
                const newFavorite = !word.isFavorite;
                await repository.updateWord(word.id, { isFavorite: newFavorite });
                setQuestions((prev) => prev.map((q, i) => i === currentIndex ? { ...q, word: { ...q.word, isFavorite: newFavorite } } : q));
                setAllWords((prev) => prev.map((w) => w.id === word.id ? { ...w, isFavorite: newFavorite } : w));
              }}
              className="p-2"
              aria-label={currentQuestion?.word.isFavorite ? 'お気に入り解除' : 'お気に入り'}
            >
              <Icon name="bookmark" size={24} filled={currentQuestion?.word.isFavorite ?? false} className={currentQuestion?.word.isFavorite ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted)]'} />
            </button>
          </div>

          {/* Quiz content - conditional on active/passive vocabularyType */}
          {!isActiveVocab ? (
            <div className="space-y-2.5 w-full flex-shrink-0">
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
          ) : (
            /* Type-in mode - iOS style */
            <div className="w-full flex-shrink-0 space-y-4">
              <TypeInQuizField
                answer={currentQuestion?.word.english ?? ''}
                value={typeInAnswer}
                onChange={setTypeInAnswer}
                onSubmit={() => {
                  if (!isRevealed) handleTypeInSubmit();
                }}
                disabled={isRevealed}
                result={typeInResult}
              />
              {!isRevealed && (
                <button
                  onClick={handleTypeInSubmit}
                  disabled={!typeInAnswer.trim()}
                  className="w-full py-4 rounded-xl bg-[var(--color-foreground)] text-white font-bold text-base disabled:opacity-40 transition-opacity"
                >
                  回答する
                </button>
              )}
              {isRevealed && typeInResult === 'wrong' && currentQuestion && (
                <div className="text-center">
                  <p className="text-sm text-[var(--color-muted)]">正解:</p>
                  <p className="text-lg font-bold text-[var(--color-foreground)]">
                    {isActiveVocab
                      ? currentQuestion.word.english
                      : quizDirection === 'en-to-ja'
                        ? currentQuestion.word.japanese
                        : currentQuestion.word.english}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Example sentence after answering */}
          {isRevealed && currentQuestion && (
            <div className="w-full mt-4 flex-shrink-0">
              {currentQuestion.word.exampleSentence && (
                <div className="card p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)] font-semibold">
                    <Icon name="format_quote" size={14} />
                    例文
                  </div>
                  <p className="text-sm text-[var(--color-foreground)] leading-relaxed">{currentQuestion.word.exampleSentence}</p>
                  {currentQuestion.word.exampleSentenceJa && (
                    <p className="text-xs text-[var(--color-muted)] leading-relaxed">{currentQuestion.word.exampleSentenceJa}</p>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </main>

        {/* Bottom next button */}
        {isRevealed && (
          <div className="flex-shrink-0 bg-[var(--color-background)] pt-3 pb-6 safe-area-bottom w-full">
            <div className="mx-auto w-full max-w-lg px-6">
              <button
                onClick={moveToNext}
                disabled={isTransitioning}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-[var(--color-foreground)] text-white font-bold text-base disabled:opacity-50"
              >
                次へ
                <Icon name="chevron_right" size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </QuizDesktopViewport>
  );
}
