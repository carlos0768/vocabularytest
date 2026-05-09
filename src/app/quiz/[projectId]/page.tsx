'use client';

import { type ReactNode, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { TypeInQuizField } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { recordCorrectAnswer, recordWrongAnswer, recordActivity, getGuestUserId } from '@/lib/utils';
import { calculateNextReview, getStatusAfterAnswer, getWordsDueForReview, sortWordsByPriority } from '@/lib/spaced-repetition';
import { loadCollectionWords } from '@/lib/collection-words';
import {
  generateQuizQuestions,
  getQuizStorageKey,
  isQuizStateExpired,
  type QuizDirection,
} from '@/lib/quiz/quiz-state';
import {
  calculateQuizScorePercentage,
  getQuizCompletionMessage,
} from '@/lib/quiz/quiz-progress';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useOnboarding } from '@/hooks/use-onboarding';
import { HintBanner } from '@/components/onboarding/HintBanner';
import { PwaInstallPromptModal } from '@/components/onboarding/PwaInstallPromptModal';
import type { Word, QuizQuestion, SubscriptionStatus } from '@/types';

const DEFAULT_QUESTION_COUNT = 10;
const MAX_NORMAL_QUIZ_QUESTION_COUNT = 20;
const DISTRACTOR_MAX_ATTEMPTS = 3;
const DISTRACTOR_API_CHUNK_SIZE = 20;
const DISTRACTOR_FETCH_TIMEOUT_MS = 25000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface QuizPersistState {
  questions: QuizQuestion[];
  currentIndex: number;
  selectedIndex: number | null;
  isRevealed: boolean;
  results: { correct: number; total: number };
  answerResults?: (boolean | null)[];
  questionCount: number;
  quizDirection: QuizDirection;
  timestamp: number;
}

/* ---------- DS-styled option card ---------- */
function DSQuizOption({
  label,
  index,
  isSelected,
  isCorrect,
  isRevealed,
  onSelect,
  disabled,
}: {
  label: string;
  index: number;
  isSelected: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const isCorrectAnswer = isRevealed && isCorrect;
  const isWrongAnswer = isRevealed && isSelected && !isCorrect;
  const isInactive = isRevealed && !isSelected && !isCorrect;

  let faceBg = '#fff';
  let borderColor = 'var(--solid-ink)';
  let shadowColor = 'var(--solid-ink)';
  let textColor = 'var(--solid-ink)';
  let badgeBg = '#fff';
  let badgeColor = 'var(--solid-ink)';
  let icon: ReactNode = null;

  if (isCorrectAnswer) {
    faceBg = 'rgba(61,122,78,0.08)';
    shadowColor = 'var(--color-success)';
    badgeBg = 'var(--color-success)';
    badgeColor = '#fff';
    icon = <Icon name="check" size={18} className="text-[var(--color-success)]" />;
  } else if (isWrongAnswer) {
    faceBg = 'rgba(184,72,72,0.08)';
    shadowColor = 'var(--color-error)';
    badgeBg = 'var(--color-error)';
    badgeColor = '#fff';
    icon = <Icon name="close" size={18} className="text-[var(--color-error)]" />;
  } else if (isInactive) {
    borderColor = 'var(--color-border)';
    shadowColor = 'var(--color-border)';
    textColor = 'var(--color-muted)';
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="relative w-full text-left disabled:cursor-not-allowed"
    >
      {/* shadow plate */}
      <div
        className="absolute inset-0 rounded-xl"
        style={{ transform: 'translate(2.5px, 2.5px)', background: shadowColor }}
      />
      <div
        className="relative flex items-center gap-[11px] rounded-xl border-[1.25px] px-3.5 py-3.5"
        style={{ background: faceBg, borderColor }}
      >
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-[1.25px] border-[var(--solid-ink)] font-mono text-[11px] font-bold"
          style={{ background: badgeBg, color: badgeColor }}
        >
          {String.fromCharCode(65 + index)}
        </div>
        <div className="flex-1 text-[15px] font-semibold leading-[1.35]" style={{ color: textColor }}>
          {label}
        </div>
        {icon}
      </div>
    </button>
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
  const { step: onboardingStep, setStep: setOnboardingStep } = useOnboarding();
  const [pwaPromptOpen, setPwaPromptOpen] = useState(false);

  const countFromUrl = searchParams.get('count');
  const returnPath = searchParams.get('from');
  const reviewMode = searchParams.get('review') === '1';
  const learnMode = searchParams.get('learn') === '1';
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
  const [results, setResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const [answerResults, setAnswerResults] = useState<(boolean | null)[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [distractorError, setDistractorError] = useState<string | null>(null);
  const [inputCount, setInputCount] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [quizDirection, setQuizDirection] = useState<QuizDirection>('en-to-ja');
  const [typeInAnswer, setTypeInAnswer] = useState('');
  const [typeInResult, setTypeInResult] = useState<'correct' | 'wrong' | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const needsDistractors = useCallback((w: Word) => {
    const missingDistractors =
      !w.distractors || w.distractors.length === 0 ||
      (w.distractors.length === 3 && w.distractors[0] === '選択肢1');
    return missingDistractors;
  }, []);

  const restoredFromStorage = useRef(false);
  const vocabularyMergeFromLocalAppliedRef = useRef(false);
  const storageKey = getQuizStorageKey(projectId, reviewMode, learnMode);

  const saveQuizState = useCallback(() => {
    if (questions.length === 0 || !questionCount) return;
    const state: QuizPersistState = {
      questions, currentIndex, selectedIndex, isRevealed, results, answerResults, questionCount, quizDirection,
      timestamp: Date.now(),
    };
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }
  }, [questions, currentIndex, selectedIndex, isRevealed, results, answerResults, questionCount, quizDirection, storageKey]);

  const clearQuizState = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [storageKey]);

  const goToNextReviewQuiz = useCallback(() => {
    clearQuizState();
    restoredFromStorage.current = false;
    const fromQ = returnPath ? `&from=${encodeURIComponent(returnPath)}` : '';
    const cnt = Math.max(1, Math.min(questionCount ?? DEFAULT_QUESTION_COUNT, MAX_NORMAL_QUIZ_QUESTION_COUNT));
    const modeParam = learnMode ? 'learn=1' : 'review=1';
    const url = `${pathname}?${modeParam}&count=${cnt}${fromQ}&_rs=${Date.now()}`;
    window.location.assign(url);
  }, [clearQuizState, returnPath, questionCount, pathname, learnMode]);

  useEffect(() => {
    if (questions.length > 0 && questionCount && !isComplete) saveQuizState();
  }, [questions, currentIndex, selectedIndex, isRevealed, results, answerResults, questionCount, quizDirection, isComplete, saveQuizState]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && questions.length > 0 && !isComplete) saveQuizState();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [saveQuizState, questions.length, isComplete]);

  useEffect(() => {
    if (isComplete) clearQuizState();
  }, [isComplete, clearQuizState]);

  const generateQuestions = useCallback((words: Word[], count: number, direction: QuizDirection = 'en-to-ja'): QuizQuestion[] => {
    return generateQuizQuestions(words, count, direction);
  }, []);

  const startQuizWithDistractors = useCallback(async (words: Word[], count: number) => {
    const selected = sortWordsByPriority(words).slice(0, count);
    setDistractorError(null);
    if (quizDirection === 'ja-to-en') {
      setQuestions(generateQuestions(selected, selected.length, quizDirection));
      return;
    }
    setQuestions(generateQuestions(words, count, quizDirection));
    const toImprove = selected.filter((w) => needsDistractors(w));
    if (toImprove.length === 0) return;

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
              body: JSON.stringify({ words: chunk.map((w) => ({ id: w.id, english: w.english, japanese: w.japanese })) }),
              signal: controller.signal,
            });
          } finally { clearTimeout(timeoutId); }
          const data = await response.json();
          if (!response.ok || !data.success || !Array.isArray(data.results)) throw new Error(data?.error || 'failed');
          const distractorMap = new Map<string, string[]>();
          const exampleMap = new Map<string, { exampleSentence: string; exampleSentenceJa: string }>();
          const succeededIds = new Set<string>();
          for (const result of data.results) {
            if (!result?.wordId || !Array.isArray(result.distractors) || result.distractors.length === 0) continue;
            distractorMap.set(result.wordId, result.distractors);
            succeededIds.add(result.wordId);
            if (result.exampleSentence) exampleMap.set(result.wordId, { exampleSentence: result.exampleSentence, exampleSentenceJa: result.exampleSentenceJa || '' });
          }
          if (distractorMap.size > 0) {
            await Promise.all([...distractorMap.entries()].map(([wordId, distractors]) => {
              const updates: Record<string, unknown> = { distractors };
              const example = exampleMap.get(wordId);
              if (example) { updates.exampleSentence = example.exampleSentence; updates.exampleSentenceJa = example.exampleSentenceJa; }
              return repository.updateWord(wordId, updates).catch(() => {});
            }));
            setAllWords((prev) => prev.map((w) => {
              const nd = distractorMap.get(w.id);
              const ne = exampleMap.get(w.id);
              return { ...w, ...(nd ? { distractors: nd } : {}), ...(ne && (!w.exampleSentence || !w.exampleSentence.trim()) ? { exampleSentence: ne.exampleSentence, exampleSentenceJa: ne.exampleSentenceJa } : {}) };
            }));
          }
          pendingWords = pendingWords.filter((w) => !succeededIds.has(w.id));
          if (pendingWords.length > 0 && attempt < DISTRACTOR_MAX_ATTEMPTS) await sleep(250 * attempt);
        } catch (error) {
          console.error(`Background distractor improve (attempt ${attempt}):`, error);
          if (attempt < DISTRACTOR_MAX_ATTEMPTS) await sleep(250 * attempt);
        }
      }
    })();
  }, [generateQuestions, needsDistractors, quizDirection, repository]);

  useEffect(() => {
    if (authLoading || userPreferencesLoading) return;
    if (aiEnabled === false) { setLoading(false); return; }

    const tryRestoreState = (): boolean => {
      if (restoredFromStorage.current) return false;
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (!saved) return false;
        const state: QuizPersistState = JSON.parse(saved);
        if (isQuizStateExpired(state.timestamp)) { sessionStorage.removeItem(storageKey); return false; }
        if (!state.questions || state.questions.length === 0) return false;
        const restoredCount = Math.max(1, Math.min(state.questionCount || state.questions.length, state.questions.length, MAX_NORMAL_QUIZ_QUESTION_COUNT));
        const restoredQuestions = state.questions.slice(0, restoredCount);
        setQuestions(restoredQuestions);
        setCurrentIndex(Math.min(state.currentIndex, Math.max(0, restoredQuestions.length - 1)));
        setSelectedIndex(state.selectedIndex);
        setIsRevealed(state.isRevealed);
        setResults(state.results);
        setAnswerResults(
          Array.isArray(state.answerResults) && state.answerResults.length === restoredQuestions.length
            ? state.answerResults
            : Array.from({ length: restoredQuestions.length }, () => null)
        );
        setQuestionCount(restoredCount);
        setQuizDirection(state.quizDirection);
        setAllWords(restoredQuestions.map(q => q.word));
        restoredFromStorage.current = true;
        setLoading(false);
        return true;
      } catch { sessionStorage.removeItem(storageKey); return false; }
    };

    if (tryRestoreState()) return;

    const loadWords = async () => {
      try {
        const ensureProjectAccess = async (): Promise<boolean> => {
          const ownerUserId = user ? user.id : getGuestUserId();
          try {
            const localProject = await repository.getProject(projectId);
            if (localProject?.userId === ownerUserId) return true;
          } catch { /* continue */ }
          if (!navigator.onLine) return true;
          if (user) {
            try {
              const remoteProject = await remoteRepository.getProject(projectId);
              return remoteProject?.userId === ownerUserId;
            } catch { return true; }
          }
          return false;
        };

        let sourceWords: Word[] = [];

        if (reviewMode || learnMode) {
          const userId = user ? user.id : getGuestUserId();
          let projects = await repository.getProjects(userId);
          let wordRepo = repository;
          if (projects.length === 0 && user && navigator.onLine) {
            try {
              projects = await remoteRepository.getProjects(user.id);
              if (projects.length > 0) wordRepo = remoteRepository;
            } catch { /* ignore */ }
          }
          const projectIds = projects.map((p) => p.id);
          if (projectIds.length === 0) { backToProject(); return; }
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
            const arrays = await Promise.all(projectIds.map((id) => wordRepo.getWords(id)));
            wordsByProject = Object.fromEntries(projectIds.map((id, idx) => [id, arrays[idx] ?? []]));
          }
          const allFlat = projectIds.flatMap((id) => wordsByProject[id] ?? []);
          sourceWords = reviewMode
            ? getWordsDueForReview(allFlat)
            : allFlat.filter((w) => w.status !== 'mastered');
        } else if (collectionId) {
          sourceWords = await loadCollectionWords(collectionId);
        } else {
          const hasAccess = await ensureProjectAccess();
          if (!hasAccess) { backToProject(); return; }
          let loadedWords = await repository.getWords(projectId);
          if (loadedWords.length === 0 && user && navigator.onLine) {
            try { loadedWords = await remoteRepository.getWords(projectId); } catch { /* ignore */ }
          }
          sourceWords = loadedWords;
        }

        if (!reviewMode && !learnMode) {
          const nonMastered = sourceWords.filter((w) => w.status !== 'mastered');
          if (nonMastered.length > 0) sourceWords = nonMastered;
        }

        if (sourceWords.length === 0) { backToProject(); return; }

        const prioritized = sortWordsByPriority(sourceWords);
        setAllWords(prioritized);

        const resolvedCount = Math.max(1, Math.min(questionCount ?? prioritized.length, prioritized.length, MAX_NORMAL_QUIZ_QUESTION_COUNT));
        if (questionCount !== resolvedCount) setQuestionCount(resolvedCount);

        if (resolvedCount) {
          if (prioritized.some((w) => needsDistractors(w))) {
            setLoading(false);
            await startQuizWithDistractors(prioritized, resolvedCount);
          } else {
            setQuestions(generateQuestions(prioritized, resolvedCount, quizDirection));
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
  }, [projectId, repository, router, generateQuestions, startQuizWithDistractors, authLoading, userPreferencesLoading, aiEnabled, questionCount, reviewMode, learnMode, collectionId, backToProject, user, storageKey, needsDistractors, quizDirection]);

  useEffect(() => {
    if (authLoading || !user || reviewMode || learnMode || collectionId) return;
    const syncRemote = async () => {
      try {
        const remoteWords = await remoteRepository.getWords(projectId);
        const pending = remoteWords.filter((w) => w.status !== 'mastered');
        if (pending.length > 0) setAllWords((prev) => pending.length > prev.length ? sortWordsByPriority(pending) : prev);
      } catch { /* silent */ }
    };
    syncRemote();
  }, [authLoading, user, projectId, reviewMode, learnMode, collectionId]);

  useEffect(() => {
    if (!restoredFromStorage.current) return;
    if (reviewMode || learnMode || collectionId) return;
    if (questions.length === 0) return;
    if (vocabularyMergeFromLocalAppliedRef.current) return;
    vocabularyMergeFromLocalAppliedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await repository.getWords(projectId);
        if (cancelled || fresh.length === 0) return;
        const byId = new Map(fresh.map((w) => [w.id, w]));
        setQuestions((prev) => prev.map((q) => {
          const w = byId.get(q.word.id);
          if (!w) return q;
          if ((w.vocabularyType ?? null) === (q.word.vocabularyType ?? null)) return q;
          return { ...q, word: { ...q.word, vocabularyType: w.vocabularyType } };
        }));
        setAllWords((prev) => prev.map((w) => {
          const nw = byId.get(w.id);
          if (!nw) return w;
          if ((nw.vocabularyType ?? null) === (w.vocabularyType ?? null)) return w;
          return { ...w, vocabularyType: nw.vocabularyType };
        }));
      } catch { vocabularyMergeFromLocalAppliedRef.current = false; }
    })();
    return () => { cancelled = true; };
  }, [questions.length, projectId, repository, reviewMode, learnMode, collectionId]);

  const currentQuestion = questions[currentIndex];
  const isActiveVocab = currentQuestion?.word.vocabularyType === 'active';

  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null) return;
    setSelectedIndex(index);
    setIsRevealed(true);
    const isCorrect = index === currentQuestion.correctIndex;
    const word = currentQuestion.word;
    setResults((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    setAnswerResults((prev) => {
      const next = prev.length === questions.length ? [...prev] : Array.from({ length: questions.length }, (_, i) => prev[i] ?? null);
      next[currentIndex] = isCorrect;
      return next;
    });
    if (isCorrect) recordCorrectAnswer(false);
    else recordWrongAnswer(word.id, word.english, word.japanese, reviewMode || learnMode ? word.projectId : projectId, word.distractors);
    recordActivity();
    try {
      const newStatus = getStatusAfterAnswer(word.status, isCorrect);
      const srUpdate = calculateNextReview(isCorrect, word);
      const updates = { status: newStatus, ...srUpdate };
      await repository.updateWord(word.id, updates);
      setQuestions((prev) => prev.map((q, i) => i === currentIndex ? { ...q, word: { ...q.word, ...updates } } : q));
      setAllWords((prev) => prev.map((w) => w.id === word.id ? { ...w, ...updates } : w));
    } catch (error) { console.error('Failed to update spaced repetition:', error); }
  };

  const handleTypeInSubmit = async () => {
    if (isRevealed || !currentQuestion) return;
    const correctAnswer = isActiveVocab ? currentQuestion.word.english : quizDirection === 'en-to-ja' ? currentQuestion.word.japanese : currentQuestion.word.english;
    const isCorrect = typeInAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    setTypeInResult(isCorrect ? 'correct' : 'wrong');
    setIsRevealed(true);
    const word = currentQuestion.word;
    setResults((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    setAnswerResults((prev) => {
      const next = prev.length === questions.length ? [...prev] : Array.from({ length: questions.length }, (_, i) => prev[i] ?? null);
      next[currentIndex] = isCorrect;
      return next;
    });
    if (isCorrect) recordCorrectAnswer(false);
    else recordWrongAnswer(word.id, word.english, word.japanese, reviewMode || learnMode ? word.projectId : projectId, word.distractors);
    recordActivity();
    try {
      const newStatus = getStatusAfterAnswer(word.status, isCorrect);
      const srUpdate = calculateNextReview(isCorrect, word);
      const updates = { status: newStatus, ...srUpdate };
      await repository.updateWord(word.id, updates);
      setQuestions((prev) => prev.map((q, i) => i === currentIndex ? { ...q, word: { ...q.word, ...updates } } : q));
      setAllWords((prev) => prev.map((w) => w.id === word.id ? { ...w, ...updates } : w));
    } catch { /* ignore */ }
  };

  const moveToNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
      // Onboarding: any quiz completion advances to 'completed'.
      if (onboardingStep === 'signed_up' || onboardingStep === 'first_scan_done') {
        void setOnboardingStep('completed');
        // Defer PWA prompt slightly so the completion screen lands first.
        window.setTimeout(() => setPwaPromptOpen(true), 700);
      }
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
    clearQuizState();
    const count = Math.max(1, Math.min(questionCount ?? allWords.length ?? DEFAULT_QUESTION_COUNT, allWords.length || DEFAULT_QUESTION_COUNT, MAX_NORMAL_QUIZ_QUESTION_COUNT));
    if (allWords.some((w) => needsDistractors(w))) await startQuizWithDistractors(allWords, count);
    else setQuestions(generateQuestions(allWords, count, quizDirection));
    setCurrentIndex(0); setSelectedIndex(null); setIsRevealed(false);
    setResults({ correct: 0, total: 0 }); setAnswerResults([]); setIsComplete(false);
  };

  const handleSelectCount = async (count: number) => {
    setQuestionCount(count);
    if (allWords.length > 0) {
      if (allWords.some((w) => needsDistractors(w))) await startQuizWithDistractors(allWords, count);
      else setQuestions(generateQuestions(allWords, count, quizDirection));
    }
  };

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--solid-ink)] border-t-transparent" />
          <p className="text-[var(--color-muted)]">クイズを準備中...</p>
        </div>
      </div>
    );
  }

  /* ---------- AI disabled ---------- */
  if (aiEnabled === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] p-6">
        <p className="mb-2 font-semibold text-[var(--solid-ink)]">この機能は現在OFFです</p>
        <p className="mb-6 text-center text-sm text-[var(--color-muted)]">設定の「単語帳生成設定」でAI機能をONにすると4択クイズを使えます。</p>
        <SolidButton variant="inverse" onClick={backToProject} className="w-full max-w-xs">単語帳に戻る</SolidButton>
      </div>
    );
  }

  /* ---------- Distractor error ---------- */
  if (distractorError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] p-6">
        <p className="mb-6 text-center text-[var(--color-error)]">{distractorError}</p>
        <div className="w-full max-w-xs space-y-3">
          <SolidButton variant="inverse" onClick={() => { setDistractorError(null); if (questionCount) startQuizWithDistractors(allWords, questionCount); }} className="w-full">
            <Icon name="refresh" size={18} />再試行
          </SolidButton>
          <SolidButton onClick={backToProject} className="w-full">単語一覧に戻る</SolidButton>
        </div>
      </div>
    );
  }

  /* ---------- Question count selection ---------- */
  if (!questionCount) {
    const maxQ = Math.min(allWords.length, MAX_NORMAL_QUIZ_QUESTION_COUNT);
    const parsed = parseInt(inputCount, 10);
    const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= maxQ;
    return (
      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pt-3">
        <div className="flex items-center gap-2.5 px-4 pb-3.5 pt-2">
          <button type="button" onClick={backToProject} className="inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h1 className="mb-2 text-center font-display text-2xl font-black text-[var(--solid-ink)]">問題数を入力</h1>
            <p className="mb-4 text-center text-[var(--color-muted)]">1〜{maxQ}問まで</p>
            {(onboardingStep === 'signed_up' || onboardingStep === 'first_scan_done') && (
              <div className="mb-6">
                <HintBanner
                  icon="quiz"
                  title="4 択から正しい意味を選ぼう！"
                  description="間違えても OK。スピード感が大事です。"
                  tone="violet"
                />
              </div>
            )}
            <div className="space-y-6">
              <div className="flex items-center justify-center gap-3">
                <input
                  type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={maxQ}
                  value={inputCount} onChange={(e) => setInputCount(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && isValid) handleSelectCount(parsed); }}
                  placeholder={String(DEFAULT_QUESTION_COUNT)}
                  className="w-24 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-3 text-center text-3xl font-bold text-[var(--solid-ink)] focus:outline-none"
                  autoFocus
                />
                <span className="text-xl text-[var(--color-muted)]">問</span>
              </div>
              <div className="flex items-center justify-center">
                <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
                  {(['en-to-ja', 'ja-to-en'] as const).map((dir) => (
                    <button key={dir} type="button" onClick={() => setQuizDirection(dir)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${quizDirection === dir ? 'bg-[var(--solid-ink)] text-white' : 'text-[var(--color-muted)]'}`}>
                      {dir === 'en-to-ja' ? '英→日' : '日→英'}
                    </button>
                  ))}
                </div>
              </div>
              <SolidButton variant="inverse" onClick={() => handleSelectCount(parsed)} disabled={!isValid} className="w-full justify-center">スタート</SolidButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- Quiz complete ---------- */
  if (isComplete) {
    const percentage = calculateQuizScorePercentage(results);
    const completionMessage = getQuizCompletionMessage(percentage);
    return (
      <>
      <PwaInstallPromptModal open={pwaPromptOpen} onClose={() => setPwaPromptOpen(false)} />
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[var(--color-background)] font-[var(--font-body)] lg:left-[280px]">
        <button type="button" onClick={backToProject} className="absolute left-4 inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]" style={{ top: 'max(8px, calc(env(safe-area-inset-top) + 8px))' }}>
          <Icon name="close" size={22} />
        </button>
        <div className="w-full max-w-sm px-6">
          <div className="w-full rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] p-8 text-center shadow-[3px_4px_0_var(--solid-ink)]">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(61,122,78,0.08)]">
              <Icon name="emoji_events" size={40} className="text-[var(--color-success)]" />
            </div>
            <h1 className="mb-2 font-display text-2xl font-black text-[var(--solid-ink)]">クイズ完了!</h1>
            <p className="mb-1 font-mono text-5xl font-black text-[var(--color-success)]">{percentage}%</p>
            <p className="mb-6 text-[var(--color-muted)]">{results.total}問中 {results.correct}問正解</p>
            <p className="mb-8 text-[var(--solid-ink)]">
              {completionMessage}
            </p>
            <div className="space-y-3">
              {reviewMode || learnMode ? (
                <>
                  <SolidButton variant="inverse" onClick={goToNextReviewQuiz} iconRight="arrow_forward" className="w-full justify-center">次へ進む</SolidButton>
                  <SolidButton onClick={handleRestart} iconLeft="refresh" className="w-full justify-center">もう一度</SolidButton>
                </>
              ) : (
                <>
                  <SolidButton variant="inverse" onClick={handleRestart} iconLeft="refresh" className="w-full justify-center">もう一度</SolidButton>
                  <SolidButton onClick={backToProject} className="w-full justify-center">単語一覧に戻る</SolidButton>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  /* ---------- Main quiz screen (DS style) ---------- */
  const total = questions.length;

  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:left-[280px]">
      {/* Header: close + progress dots + flag */}
      <div
        className="flex shrink-0 items-center gap-2.5 px-4 pb-3.5"
        style={{ paddingTop: 'max(8px, calc(env(safe-area-inset-top) + 8px))' }}
      >
        <button type="button" onClick={backToProject} className="inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]">
          <Icon name="close" size={22} />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <div className="flex flex-1 gap-[3px]">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className="h-[5px] flex-1 rounded-sm"
                style={{
                  background:
                    i < currentIndex
                      ? answerResults[i] === true
                        ? 'var(--color-success)'
                        : answerResults[i] === false
                          ? 'var(--color-error)'
                          : 'rgba(26,26,26,0.1)'
                      : i === currentIndex
                        ? 'var(--solid-ink)'
                        : 'rgba(26,26,26,0.1)',
                  border: i === currentIndex ? '0.5px solid var(--solid-ink)' : 'none',
                }}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--solid-ink)]">
            {currentIndex + 1}<span className="text-[var(--color-muted)]">/{total}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!currentQuestion) return;
            const word = currentQuestion.word;
            const newFavorite = !word.isFavorite;
            await repository.updateWord(word.id, { isFavorite: newFavorite });
            setQuestions((prev) => prev.map((q, i) => i === currentIndex ? { ...q, word: { ...q.word, isFavorite: newFavorite } } : q));
            setAllWords((prev) => prev.map((w) => w.id === word.id ? { ...w, isFavorite: newFavorite } : w));
          }}
          className="inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]"
        >
          <Icon name="bookmark" size={19} filled={currentQuestion?.word.isFavorite ?? false} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-2.5">
        <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          {isActiveVocab ? 'タイプ入力' : '意味を選ぼう'}
        </div>

        {/* Word display — big solid plate */}
        <div className="relative">
          <div className="absolute inset-0 rounded-[18px] translate-x-[3px] translate-y-[4px] bg-[var(--solid-ink)]" />
          <div className="relative rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] px-[18px] py-6 text-center">
            <div className="mb-2 font-mono text-[11px] text-[var(--color-muted)]">
              {currentQuestion?.word.pronunciation || ''}
            </div>
            <div className="font-display text-[34px] font-extrabold leading-[1.1] tracking-[-0.01em] text-[var(--solid-ink)]">
              {isActiveVocab
                ? currentQuestion?.word.japanese
                : quizDirection === 'en-to-ja'
                  ? currentQuestion?.word.english
                  : currentQuestion?.word.japanese}
            </div>
            {!isActiveVocab && (
              <div className="mt-2.5 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    if (currentQuestion?.word.english) {
                      window.speechSynthesis.cancel();
                      const utt = new SpeechSynthesisUtterance(currentQuestion.word.english);
                      utt.lang = 'en-US'; utt.rate = 0.9;
                      window.speechSynthesis.speak(utt);
                    }
                  }}
                  className="inline-flex items-center gap-[5px] rounded-full border border-[var(--color-border)] bg-[rgba(26,26,26,0.04)] px-2.5 py-[5px] text-[11px] font-semibold text-[var(--color-muted)]"
                >
                  <Icon name="volume_up" size={12} /> 読み上げ
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Options or type-in */}
        {!isActiveVocab ? (
          <div className="mt-[18px] flex flex-col gap-2">
            {currentQuestion?.options.map((option, i) => (
              <DSQuizOption
                key={i}
                label={option}
                index={i}
                isSelected={selectedIndex === i}
                isCorrect={i === currentQuestion.correctIndex}
                isRevealed={isRevealed}
                onSelect={() => handleSelect(i)}
                disabled={isRevealed}
              />
            ))}
          </div>
        ) : (
          <div className="mt-[18px] w-full space-y-4">
            <TypeInQuizField
              answer={currentQuestion?.word.english ?? ''}
              value={typeInAnswer}
              onChange={setTypeInAnswer}
              onSubmit={() => { if (!isRevealed) handleTypeInSubmit(); }}
              disabled={isRevealed}
              result={typeInResult}
            />
            {!isRevealed && (
              <SolidButton variant="inverse" onClick={handleTypeInSubmit} disabled={!typeInAnswer.trim()} className="w-full justify-center">
                回答する
              </SolidButton>
            )}
            {isRevealed && typeInResult === 'wrong' && currentQuestion && (
              <div className="text-center">
                <p className="text-sm text-[var(--color-muted)]">正解:</p>
                <p className="text-lg font-bold text-[var(--solid-ink)]">{currentQuestion.word.english}</p>
              </div>
            )}
          </div>
        )}

        {/* Example sentence revealed */}
        {isRevealed && currentQuestion?.word.exampleSentence && (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] bg-white p-[13px_14px]">
            <div className="mb-[5px] font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">EXAMPLE</div>
            <div className="text-sm font-medium leading-[1.55] text-[var(--solid-ink)]">
              {currentQuestion.word.exampleSentence}
            </div>
            {currentQuestion.word.exampleSentenceJa && (
              <div className="mt-1 text-xs leading-[1.55] text-[var(--color-muted)]">{currentQuestion.word.exampleSentenceJa}</div>
            )}
          </div>
        )}
      </div>

      {/* Bottom CTA — only shown after reveal */}
      {isRevealed && (
        <div
          className="shrink-0 bg-[var(--color-background)] px-5 pt-3"
          style={{ paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom) + 12px))' }}
        >
          <SolidButton variant="inverse" iconRight="chevron_right" onClick={moveToNext} disabled={isTransitioning} className="w-full justify-center">
            次へ
          </SolidButton>
        </div>
      )}
    </div>
  );
}
