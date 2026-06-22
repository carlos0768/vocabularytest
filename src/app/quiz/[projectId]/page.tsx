'use client';

import { type ReactNode, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams, usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { TypeInQuizField } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import {
  recordCorrectAnswer,
  recordWrongAnswer,
  recordActivity,
  getGuestUserId,
  getWrongAnswers,
  type WrongAnswer,
} from '@/lib/utils';
import { getWordsDueForReview, sortWordsByPriority } from '@/lib/spaced-repetition';
import { loadCollectionWords } from '@/lib/collection-words';
import {
  applyWordOrderQuestionsToPendingQuiz,
  generateQuizQuestions,
  getFavoritesQuizStorageKey,
  getQuizStorageKey,
  isQuizStateExpired,
  type QuizDirection,
} from '@/lib/quiz/quiz-state';
import {
  isActiveQuizWord,
  normalizeActiveQuizAnswer,
  stripActiveQuizAnswerSpaces,
} from '@/lib/quiz/active-answer';
import {
  WORD_ORDER_BLANK_TOKEN,
  buildWordOrderQuestion,
  isWordOrderEligible,
  normalizeWordOrderQuizCache,
} from '@/lib/quiz/word-order';
import {
  calculateQuizScorePercentage,
  getQuizAdvanceState,
  getQuizCompletionMessage,
  parseQuizQuestionCountInput,
} from '@/lib/quiz/quiz-progress';
import {
  buildQuizAnswerOutcomePlan,
  getTypeInCorrectAnswer,
  isTypeInAnswerCorrect,
} from '@/lib/quiz/quiz-answer';
import { parseQuizBackgroundDistractorResults } from '@/lib/quiz/background-distractors';
import { parseReminderPriorityIds, selectReminderQuizWords } from '@/lib/quiz/reminder-quiz';
import { playAnswerFeedbackSound } from '@/lib/audio/answer-feedback';
import { formatPartOfSpeechLabels } from '@/lib/part-of-speech-labels';
import { useAuth } from '@/hooks/use-auth';
import { isBillingEnabled } from '@/lib/billing/feature';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useOnboarding } from '@/hooks/use-onboarding';
import { PwaInstallPromptModal } from '@/components/onboarding/PwaInstallPromptModal';
import type {
  MultipleChoiceQuizQuestion,
  QuizQuestion,
  SubscriptionStatus,
  Word,
  WordOrderQuizCache,
  WordOrderQuizQuestion,
} from '@/types';

const DEFAULT_QUESTION_COUNT = 10;
const MAX_NORMAL_QUIZ_QUESTION_COUNT = 20;
const DISTRACTOR_MAX_ATTEMPTS = 3;
const DISTRACTOR_API_CHUNK_SIZE = 20;
const DISTRACTOR_FETCH_TIMEOUT_MS = 25000;
const WORD_ORDER_API_CHUNK_SIZE = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface QuizPersistState {
  questions: QuizQuestion[];
  currentIndex: number;
  selectedIndex: number | null;
  wordOrderSelectedTokens?: string[];
  wordOrderResult?: 'correct' | 'wrong' | null;
  isRevealed: boolean;
  results: { correct: number; total: number };
  answerResults?: (boolean | null)[];
  questionCount: number;
  quizDirection: QuizDirection;
  timestamp: number;
}

function isWordOrderQuestion(question: QuizQuestion | undefined): question is WordOrderQuizQuestion {
  return question?.type === 'word-order';
}

function isMultipleChoiceQuestion(question: QuizQuestion | undefined): question is MultipleChoiceQuizQuestion {
  return question !== undefined && question.type !== 'word-order';
}

function chipKey(token: string): string {
  return token.trim().toLowerCase();
}

function tokensMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((token, index) => chipKey(token) === chipKey(right[index] ?? ''));
}

function normalizeDisplayText(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, ' ');
  return text ? text : null;
}

function buildCompletedWordOrderSentence(question: WordOrderQuizQuestion): string {
  let answerIndex = 0;
  const tokens = question.sentenceTokens
    .map((token) => {
      if (token !== WORD_ORDER_BLANK_TOKEN) return token;
      const answerToken = question.answerTokens[answerIndex];
      answerIndex += 1;
      return answerToken ?? '';
    })
    .filter(Boolean);

  return tokens
    .join(' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');
}

function getWordOrderExample(question: WordOrderQuizQuestion): { sentence: string; translation: string | null } | null {
  const sentence =
    normalizeDisplayText(question.word.exampleSentence) ??
    normalizeDisplayText(buildCompletedWordOrderSentence(question));
  if (!sentence) return null;

  return {
    sentence,
    translation:
      normalizeDisplayText(question.word.exampleSentenceJa) ??
      normalizeDisplayText(question.word.japanese),
  };
}

function getUsedWordOrderOptionIndexes(options: string[], selectedTokens: string[]): Set<number> {
  const usedIndexes = new Set<number>();
  for (const selectedToken of selectedTokens) {
    const selectedKey = chipKey(selectedToken);
    const optionIndex = options.findIndex((option, index) => (
      !usedIndexes.has(index) && chipKey(option) === selectedKey
    ));
    if (optionIndex >= 0) usedIndexes.add(optionIndex);
  }
  return usedIndexes;
}

function buildFallbackWordFromWrongAnswer(wrongAnswer: WrongAnswer): Word {
  const timestamp = Number.isFinite(wrongAnswer.lastWrongAt) ? wrongAnswer.lastWrongAt : Date.now();

  return {
    id: wrongAnswer.wordId,
    projectId: wrongAnswer.projectId,
    english: wrongAnswer.english,
    japanese: wrongAnswer.japanese,
    distractors: wrongAnswer.distractors,
    status: 'review',
    createdAt: new Date(timestamp).toISOString(),
    lastReviewedAt: new Date(timestamp).toISOString(),
    nextReviewAt: new Date(0).toISOString(),
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
  };
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

function DSDesktopWordOrderPanel({
  question,
  selectedTokens,
  result,
  isRevealed,
  onSelectToken,
  onRemoveToken,
}: {
  question: WordOrderQuizQuestion;
  selectedTokens: string[];
  result: 'correct' | 'wrong' | null;
  isRevealed: boolean;
  onSelectToken: (token: string) => void;
  onRemoveToken: (index: number) => void;
}) {
  const usedOptionIndexes = getUsedWordOrderOptionIndexes(question.options, selectedTokens);
  const answerStateClass = isRevealed ? (result === 'correct' ? ' correct' : ' wrong') : '';
  const answerIsFull = selectedTokens.length >= question.answerTokens.length;
  const example = getWordOrderExample(question);
  // モバイル版と同様に、文中の固定単語（デフォルト表示）と空欄を並べて表示する
  const sentenceItems = question.sentenceTokens.map((token, index) => ({
    token,
    index,
    answerIndex: token === WORD_ORDER_BLANK_TOKEN
      ? question.sentenceTokens
        .slice(0, index + 1)
        .filter((item) => item === WORD_ORDER_BLANK_TOKEN).length - 1
      : null,
  }));

  return (
    <div className="ds-word-order-stage">
      <div className="ds-word-order-prompt">
        <span className="ds-tag plain">日本語訳</span>
        <div className="ds-word-order-meaning">{question.word.japanese}</div>
        <div className="muted ds-word-order-help">単語をクリックして正しい順に並べてください</div>
      </div>

      <div className={`ds-wo-answer${answerStateClass}`}>
        {sentenceItems.map(({ token, index, answerIndex }) => {
          if (token !== WORD_ORDER_BLANK_TOKEN) {
            return (
              <span key={`${token}-${index}`} className="ds-wo-fixed">
                {token}
              </span>
            );
          }

          const selected = answerIndex === null ? undefined : selectedTokens[answerIndex];

          if (!selected) {
            return <span key={`blank-${index}`} className="ds-wo-blank" aria-label="空欄" />;
          }

          return (
            <button
              key={`blank-${index}`}
              type="button"
              className="ds-tile in-answer"
              onClick={() => answerIndex !== null && onRemoveToken(answerIndex)}
              disabled={isRevealed}
            >
              {selected}
              {!isRevealed && (
                <Icon
                  name="close"
                  style={{ fontSize: 14, marginLeft: 6, verticalAlign: '-2px', opacity: 0.7 }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="ds-wo-bank">
        {question.options.map((token, index) => {
          const isUsed = usedOptionIndexes.has(index);
          return (
            <button
              key={`${token}-${index}`}
              type="button"
              className={`ds-tile${isUsed ? ' used' : ''}`}
              onClick={() => onSelectToken(token)}
              disabled={isRevealed || isUsed || answerIsFull}
            >
              {token}
            </button>
          );
        })}
      </div>

      {isRevealed && example && (
        <div className="w-full max-w-[860px] rounded-xl border border-dashed border-[var(--color-border)] bg-white p-[13px_14px] text-left">
          <div className="mb-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">EXAMPLE</div>
          <div className="text-sm font-medium leading-[1.55] text-[var(--solid-ink)]">
            {example.sentence}
          </div>
          {example.translation && (
            <div className="mt-1 text-xs leading-[1.55] text-[var(--color-muted)]">{example.translation}</div>
          )}
        </div>
      )}
    </div>
  );
}

function DSWordOrderPanel({
  question,
  selectedTokens,
  result,
  isRevealed,
  onSelectToken,
  onRemoveToken,
  onSubmit,
}: {
  question: WordOrderQuizQuestion;
  selectedTokens: string[];
  result: 'correct' | 'wrong' | null;
  isRevealed: boolean;
  onSelectToken: (token: string) => void;
  onRemoveToken: (index: number) => void;
  onSubmit: () => void;
}) {
  const selectedKeys = new Set(selectedTokens.map(chipKey));
  const availableTokens = question.options.filter((token) => !selectedKeys.has(chipKey(token)));
  const isReady = selectedTokens.length === question.answerTokens.length;
  const example = getWordOrderExample(question);
  const sentenceItems = question.sentenceTokens.map((token, index) => ({
    token,
    index,
    answerIndex: token === WORD_ORDER_BLANK_TOKEN
      ? question.sentenceTokens
        .slice(0, index + 1)
        .filter((item) => item === WORD_ORDER_BLANK_TOKEN).length - 1
      : null,
  }));

  const revealed = isRevealed && result != null;
  const isCorrect = result === 'correct';

  return (
    <div className="mt-[18px] space-y-4">
      <div
        className="rounded-[18px] border-[1.5px] p-4"
        style={{
          borderColor: revealed ? (isCorrect ? 'var(--color-success)' : 'var(--color-error)') : 'var(--solid-ink)',
          background: revealed ? (isCorrect ? 'rgba(61,122,78,0.08)' : 'rgba(184,72,72,0.08)') : '#fff',
          boxShadow: `2px 3px 0 ${revealed ? (isCorrect ? 'var(--color-success)' : 'var(--color-error)') : 'var(--solid-ink)'}`,
        }}
      >
        <div className="flex min-h-[76px] flex-wrap items-center gap-2">
          {sentenceItems.map(({ token, index, answerIndex }) => {
            if (token !== WORD_ORDER_BLANK_TOKEN) {
              return (
                <span
                  key={`${token}-${index}`}
                  className="inline-flex min-h-10 items-center rounded-xl border border-[var(--color-border)] bg-[rgba(26,26,26,0.04)] px-3 text-[15px] font-bold text-[var(--solid-ink)]"
                >
                  {token}
                </span>
              );
            }

            const selected = answerIndex === null ? undefined : selectedTokens[answerIndex];

            return (
              <button
                key={`blank-${index}`}
                type="button"
                onClick={() => selected && answerIndex !== null && onRemoveToken(answerIndex)}
                disabled={isRevealed || !selected}
                className="inline-flex min-h-10 min-w-[74px] items-center justify-center rounded-xl border-[1.5px] px-3 text-[15px] font-black disabled:cursor-default"
                style={revealed && selected ? {
                  borderStyle: 'solid',
                  borderColor: isCorrect ? 'var(--color-success)' : 'var(--color-error)',
                  background: isCorrect ? 'var(--color-success)' : 'var(--color-error)',
                  color: '#fff',
                } : {
                  borderStyle: 'dashed',
                  borderColor: 'var(--solid-ink)',
                  background: 'var(--color-surface)',
                  color: 'var(--solid-ink)',
                }}
              >
                {selected || ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {availableTokens.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => onSelectToken(token)}
            disabled={isRevealed || selectedTokens.length >= question.answerTokens.length}
            className="relative min-h-12 rounded-xl border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-center text-[15px] font-black text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)] disabled:cursor-not-allowed disabled:border-[var(--color-border)] disabled:text-[var(--color-muted)] disabled:shadow-[2px_3px_0_var(--color-border)]"
          >
            {token}
          </button>
        ))}
      </div>

      {!isRevealed && (
        <SolidButton
          variant="inverse"
          onClick={onSubmit}
          disabled={!isReady}
          className="w-full justify-center"
        >
          回答する
        </SolidButton>
      )}

      {isRevealed && (
        <div className="relative w-full">
          <div
            className="absolute inset-0 rounded-xl"
            style={{ transform: 'translate(2.5px, 2.5px)', background: isCorrect ? 'var(--color-success)' : 'var(--color-error)' }}
          />
          <div
            className="relative rounded-xl border-[1.25px] p-3 text-center"
            style={{
              borderColor: 'var(--solid-ink)',
              background: isCorrect ? 'rgba(61,122,78,0.08)' : 'rgba(184,72,72,0.08)',
            }}
          >
            <div className="flex items-center justify-center gap-1">
              <Icon name={isCorrect ? 'check' : 'close'} size={18} style={{ color: isCorrect ? 'var(--color-success)' : 'var(--color-error)' }} />
              <p className="text-sm font-bold" style={{ color: isCorrect ? 'var(--color-success)' : 'var(--color-error)' }}>
                {isCorrect ? '正解' : '不正解'}
              </p>
            </div>
            <p className="mt-1 text-lg font-black text-[var(--solid-ink)]">{question.word.english}</p>
          </div>
        </div>
      )}

      {isRevealed && example && (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-white p-[13px_14px]">
          <div className="mb-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">EXAMPLE</div>
          <div className="text-sm font-medium leading-[1.55] text-[var(--solid-ink)]">
            {example.sentence}
          </div>
          {example.translation && (
            <div className="mt-1 text-xs leading-[1.55] text-[var(--color-muted)]">{example.translation}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading, user, isPro } = useAuth();
  const billingEnabled = isBillingEnabled();
  const { aiEnabled, loading: userPreferencesLoading } = useUserPreferences();
  const { step: onboardingStep, setStep: setOnboardingStep } = useOnboarding();
  const [pwaPromptOpen, setPwaPromptOpen] = useState(false);

  const countFromUrl = searchParams.get('count');
  const returnPath = searchParams.get('from');
  const reviewMode = searchParams.get('review') === '1';
  const learnMode = searchParams.get('learn') === '1';
  const wrongMode = searchParams.get('wrong') === '1';
  const favoritesMode = searchParams.get('favorites') === '1';
  const reminderMode = searchParams.get('reminder') === '1';
  const reminderPriorityParam = searchParams.get('priority');
  const collectionId = searchParams.get('collectionId');
  const [questionCount, setQuestionCount] = useState<number | null>(() => {
    if (!countFromUrl) return DEFAULT_QUESTION_COUNT;
    const parsed = Number.parseInt(countFromUrl, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUESTION_COUNT;
  });

  const backToProject = useCallback(() => {
    // Reminder quizzes open in a fresh window from a push notification, so
    // there is no history to go back to.
    if (reminderMode) {
      router.push('/');
      return;
    }
    router.back();
  }, [router, reminderMode]);

  const [allWords, setAllWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [wordOrderSelectedTokens, setWordOrderSelectedTokens] = useState<string[]>([]);
  const [wordOrderResult, setWordOrderResult] = useState<'correct' | 'wrong' | null>(null);
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
  const currentIndexRef = useRef(0);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const needsDistractors = useCallback((w: Word) => {
    if (isActiveQuizWord(w) || isWordOrderEligible(w)) return false;
    const missingDistractors =
      !w.distractors || w.distractors.length === 0 ||
      (w.distractors.length === 3 && w.distractors[0] === '選択肢1');
    return missingDistractors;
  }, []);

  const needsWordOrderQuiz = useCallback((w: Word) => {
    return !isActiveQuizWord(w) && isWordOrderEligible(w) && !buildWordOrderQuestion(w);
  }, []);

  const restoredFromStorage = useRef(false);
  const vocabularyMergeFromLocalAppliedRef = useRef(false);
  const storageKey = reminderMode
    ? 'quiz_state_reminder'
    : wrongMode
      ? 'quiz_state_wrong_answers'
      : favoritesMode
        ? getFavoritesQuizStorageKey(projectId)
        : getQuizStorageKey(projectId, reviewMode, learnMode);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const saveQuizState = useCallback(() => {
    if (questions.length === 0 || !questionCount) return;
    const state: QuizPersistState = {
      questions,
      currentIndex,
      selectedIndex,
      wordOrderSelectedTokens,
      wordOrderResult,
      isRevealed,
      results,
      answerResults,
      questionCount,
      quizDirection,
      timestamp: Date.now(),
    };
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore */ }
  }, [questions, currentIndex, selectedIndex, wordOrderSelectedTokens, wordOrderResult, isRevealed, results, answerResults, questionCount, quizDirection, storageKey]);

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
  }, [questions, currentIndex, selectedIndex, wordOrderSelectedTokens, wordOrderResult, isRevealed, results, answerResults, questionCount, quizDirection, isComplete, saveQuizState]);

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

  const applyGeneratedWordOrderQuizzes = useCallback(async (words: Word[]): Promise<Word[]> => {
    const targets = words.filter((word) => needsWordOrderQuiz(word)).slice(0, WORD_ORDER_API_CHUNK_SIZE);
    if (targets.length === 0) return words;

    try {
      const response = await fetch('/api/generate-word-order-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: targets.map((word) => ({
            id: word.id,
            english: word.english,
            japanese: word.japanese,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.results)) {
        throw new Error(data?.error || 'failed');
      }

      const targetsById = new Map(targets.map((word) => [word.id, word]));
      const generated = new Map<string, WordOrderQuizCache>();
      for (const result of data.results as Array<{ wordId?: unknown; quiz?: unknown }>) {
        if (typeof result.wordId !== 'string') continue;
        const word = targetsById.get(result.wordId);
        if (!word) continue;
        const quiz = normalizeWordOrderQuizCache(word, result.quiz);
        if (quiz) generated.set(word.id, quiz);
      }
      if (generated.size === 0) return words;

      await Promise.all([...generated.entries()].map(([wordId, wordOrderQuiz]) => (
        repository.updateWord(wordId, { wordOrderQuiz }).catch(() => {})
      )));

      const updatedWords = words.map((word) => {
        const wordOrderQuiz = generated.get(word.id);
        return wordOrderQuiz ? { ...word, wordOrderQuiz } : word;
      });
      setAllWords((prev) => prev.map((word) => {
        const wordOrderQuiz = generated.get(word.id);
        return wordOrderQuiz ? { ...word, wordOrderQuiz } : word;
      }));
      return updatedWords;
    } catch (error) {
      console.error('Word-order quiz generation failed:', error);
      return words;
    }
  }, [needsWordOrderQuiz, repository]);

  const generateQuestions = useCallback((words: Word[], count: number, direction: QuizDirection = 'en-to-ja'): QuizQuestion[] => {
    return generateQuizQuestions(words, count, direction, undefined, {
      allowPendingWordOrderFallback: true,
      preserveOrder: reminderMode,
    });
  }, [reminderMode]);

  const startQuizWithDistractors = useCallback(async (words: Word[], count: number) => {
    const selected = reminderMode ? words.slice(0, count) : sortWordsByPriority(words).slice(0, count);
    setDistractorError(null);
    const nextQuestions = generateQuestions(words, count, quizDirection);
    setQuestions(nextQuestions);

    if (selected.some(needsWordOrderQuiz)) {
      void applyGeneratedWordOrderQuizzes(selected).then((updatedWords) => {
        setQuestions((prev) =>
          applyWordOrderQuestionsToPendingQuiz(prev, updatedWords, currentIndexRef.current)
        );
      });
    }

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
          const { distractorMap, exampleMap, succeededIds } = parseQuizBackgroundDistractorResults(data.results);
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
  }, [applyGeneratedWordOrderQuizzes, generateQuestions, needsDistractors, needsWordOrderQuiz, quizDirection, repository, reminderMode]);

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
        setWordOrderSelectedTokens(Array.isArray(state.wordOrderSelectedTokens) ? state.wordOrderSelectedTokens : []);
        setWordOrderResult(state.wordOrderResult ?? null);
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

        if (favoritesMode) {
          if (!isPro) {
            router.replace(billingEnabled ? '/subscription' : '/favorites');
            return;
          }

          if (projectId === 'all') {
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
            let wordsByProject: Record<string, Word[]> = {};
            if (repoWithBulk.getAllWordsByProjectIds) {
              wordsByProject = await repoWithBulk.getAllWordsByProjectIds(projectIds);
            } else if (repoWithBulk.getAllWordsByProject) {
              wordsByProject = await repoWithBulk.getAllWordsByProject(projectIds);
            } else {
              const arrays = await Promise.all(projectIds.map((id) => wordRepo.getWords(id)));
              wordsByProject = Object.fromEntries(projectIds.map((id, idx) => [id, arrays[idx] ?? []]));
            }
            sourceWords = projectIds.flatMap((id) => wordsByProject[id] ?? []).filter((word) => word.isFavorite);
          } else {
            const hasAccess = await ensureProjectAccess();
            if (!hasAccess) { backToProject(); return; }
            let loadedWords = await repository.getWords(projectId);
            if (loadedWords.length === 0 && user && navigator.onLine) {
              try { loadedWords = await remoteRepository.getWords(projectId); } catch { /* ignore */ }
            }
            sourceWords = loadedWords.filter((word) => word.isFavorite);
          }
        } else if (reviewMode || learnMode || wrongMode || reminderMode) {
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
          if (projectIds.length === 0 && !wrongMode) {
            if (reminderMode) { router.replace('/'); } else { backToProject(); }
            return;
          }
          const repoWithBulk = wordRepo as typeof repository & {
            getAllWordsByProjectIds?: (ids: string[]) => Promise<Record<string, Word[]>>;
            getAllWordsByProject?: (ids: string[]) => Promise<Record<string, Word[]>>;
          };
          let wordsByProject: Record<string, Word[]> = {};
          if (projectIds.length > 0 && repoWithBulk.getAllWordsByProjectIds) {
            wordsByProject = await repoWithBulk.getAllWordsByProjectIds(projectIds);
          } else if (projectIds.length > 0 && repoWithBulk.getAllWordsByProject) {
            wordsByProject = await repoWithBulk.getAllWordsByProject(projectIds);
          } else if (projectIds.length > 0) {
            const arrays = await Promise.all(projectIds.map((id) => wordRepo.getWords(id)));
            wordsByProject = Object.fromEntries(projectIds.map((id, idx) => [id, arrays[idx] ?? []]));
          }
          const allFlat = projectIds.flatMap((id) => wordsByProject[id] ?? []);
          if (wrongMode) {
            const wordById = new Map(allFlat.map((word) => [word.id, word]));
            const projectWordIds = new Set((wordsByProject[projectId] ?? []).map((word) => word.id));
            sourceWords = getWrongAnswers()
              .filter((wrongAnswer) => {
                if (projectId === 'all') return true;
                if (wrongAnswer.projectId) return wrongAnswer.projectId === projectId;
                return projectWordIds.has(wrongAnswer.wordId);
              })
              .sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt)
              .map((wrongAnswer) => wordById.get(wrongAnswer.wordId) ?? buildFallbackWordFromWrongAnswer(wrongAnswer));
          } else if (reminderMode) {
            sourceWords = selectReminderQuizWords({
              words: allFlat,
              priorityIds: parseReminderPriorityIds(reminderPriorityParam),
              wrongAnswers: getWrongAnswers(),
            });
          } else {
            sourceWords = reviewMode
              ? getWordsDueForReview(allFlat)
              : allFlat.filter((w) => w.status !== 'mastered');
          }
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

        if (!reviewMode && !learnMode && !wrongMode && !favoritesMode && !reminderMode) {
          const nonMastered = sourceWords.filter((w) => w.status !== 'mastered');
          if (nonMastered.length > 0) sourceWords = nonMastered;
        }

        if (sourceWords.length === 0) {
          if (reminderMode) { router.replace('/'); } else { backToProject(); }
          return;
        }

        // Reminder words are already ordered (notification words first).
        const prioritized = reminderMode ? sourceWords : sortWordsByPriority(sourceWords);
        setAllWords(prioritized);

        const resolvedCount = Math.max(1, Math.min(questionCount ?? prioritized.length, prioritized.length, MAX_NORMAL_QUIZ_QUESTION_COUNT));
        if (questionCount !== resolvedCount) setQuestionCount(resolvedCount);

        if (resolvedCount) {
          if (prioritized.some((w) => needsDistractors(w) || needsWordOrderQuiz(w))) {
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
  }, [projectId, repository, router, generateQuestions, startQuizWithDistractors, authLoading, userPreferencesLoading, aiEnabled, questionCount, reviewMode, learnMode, wrongMode, favoritesMode, reminderMode, reminderPriorityParam, collectionId, backToProject, user, isPro, billingEnabled, storageKey, needsDistractors, needsWordOrderQuiz, quizDirection]);

  useEffect(() => {
    if (authLoading || !user || reviewMode || learnMode || wrongMode || favoritesMode || reminderMode || collectionId) return;
    const syncRemote = async () => {
      try {
        const remoteWords = await remoteRepository.getWords(projectId);
        const pending = remoteWords.filter((w) => w.status !== 'mastered');
        if (pending.length > 0) setAllWords((prev) => pending.length > prev.length ? sortWordsByPriority(pending) : prev);
      } catch { /* silent */ }
    };
    syncRemote();
  }, [authLoading, user, projectId, reviewMode, learnMode, wrongMode, favoritesMode, reminderMode, collectionId]);

  useEffect(() => {
    if (!restoredFromStorage.current) return;
    if (reviewMode || learnMode || wrongMode || favoritesMode || reminderMode || collectionId) return;
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
  }, [questions.length, projectId, repository, reviewMode, learnMode, wrongMode, favoritesMode, reminderMode, collectionId]);

  const currentQuestion = questions[currentIndex];
  const currentIsWordOrder = isWordOrderQuestion(currentQuestion);
  const isActiveVocab = !currentIsWordOrder && currentQuestion?.word.vocabularyType === 'active';
  const typeInExpectedAnswer = currentQuestion?.word.english ?? '';

  const applyAnswerOutcome = async (word: Word, isCorrect: boolean) => {
    playAnswerFeedbackSound(isCorrect);
    setResults((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    setAnswerResults((prev) => {
      const next = prev.length === questions.length ? [...prev] : Array.from({ length: questions.length }, (_, i) => prev[i] ?? null);
      next[currentIndex] = isCorrect;
      return next;
    });
    const recordProjectId = reviewMode || learnMode || favoritesMode || reminderMode ? word.projectId : projectId;
    const outcomePlan = buildQuizAnswerOutcomePlan({ word, isCorrect, recordProjectId });
    if (isCorrect) recordCorrectAnswer(false);
    else if (outcomePlan.wrongAnswer) {
      recordWrongAnswer(
        outcomePlan.wrongAnswer.wordId,
        outcomePlan.wrongAnswer.english,
        outcomePlan.wrongAnswer.japanese,
        outcomePlan.wrongAnswer.projectId,
        outcomePlan.wrongAnswer.distractors,
      );
    }
    recordActivity();
    try {
      const updates = outcomePlan.wordUpdates;
      await repository.updateWord(word.id, updates);
      setQuestions((prev) => prev.map((q, i) => i === currentIndex ? { ...q, word: { ...q.word, ...updates } } : q));
      setAllWords((prev) => prev.map((w) => w.id === word.id ? { ...w, ...updates } : w));
    } catch (error) { console.error('Failed to update spaced repetition:', error); }
  };

  const handleSelect = async (index: number) => {
    if (isRevealed || selectedIndex !== null || !isMultipleChoiceQuestion(currentQuestion)) return;
    setSelectedIndex(index);
    setIsRevealed(true);
    const isCorrect = index === currentQuestion.correctIndex;
    await applyAnswerOutcome(currentQuestion.word, isCorrect);
  };

  const handleTypeInSubmit = async () => {
    if (isRevealed || !isMultipleChoiceQuestion(currentQuestion)) return;
    const correctAnswer = getTypeInCorrectAnswer({
      word: currentQuestion.word,
      isActiveVocabulary: isActiveVocab,
      quizDirection,
    });
    const isCorrect = isActiveVocab
      ? normalizeActiveQuizAnswer(typeInAnswer) === normalizeActiveQuizAnswer(correctAnswer)
      : isTypeInAnswerCorrect(typeInAnswer, correctAnswer);
    setTypeInResult(isCorrect ? 'correct' : 'wrong');
    setIsRevealed(true);
    await applyAnswerOutcome(currentQuestion.word, isCorrect);
  };

  const handleWordOrderTokenSelect = (token: string) => {
    if (isRevealed || !isWordOrderQuestion(currentQuestion)) return;
    setWordOrderSelectedTokens((prev) => (
      prev.length >= currentQuestion.answerTokens.length ? prev : [...prev, token]
    ));
  };

  const handleWordOrderTokenRemove = (index: number) => {
    if (isRevealed) return;
    setWordOrderSelectedTokens((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleWordOrderSubmit = async () => {
    if (isRevealed || !isWordOrderQuestion(currentQuestion)) return;
    if (wordOrderSelectedTokens.length !== currentQuestion.answerTokens.length) return;
    const isCorrect = tokensMatch(wordOrderSelectedTokens, currentQuestion.answerTokens);
    setWordOrderResult(isCorrect ? 'correct' : 'wrong');
    setIsRevealed(true);
    await applyAnswerOutcome(currentQuestion.word, isCorrect);
  };

  const moveToNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    const advanceState = getQuizAdvanceState(currentIndex, questions.length);
    if (advanceState.isComplete) {
      setIsComplete(true);
      setIsTransitioning(advanceState.isTransitioning);
      // Onboarding: any quiz completion advances to 'completed'.
      if (onboardingStep === 'signed_up' || onboardingStep === 'first_scan_done') {
        void setOnboardingStep('completed');
        // Defer PWA prompt slightly so the completion screen lands first.
        window.setTimeout(() => setPwaPromptOpen(true), 700);
      }
    } else {
      setCurrentIndex(advanceState.nextIndex);
      if (advanceState.resetAnswerState) {
        setSelectedIndex(null);
        setWordOrderSelectedTokens([]);
        setWordOrderResult(null);
        setIsRevealed(false);
        setTypeInAnswer('');
        setTypeInResult(null);
      }
      setIsTransitioning(advanceState.isTransitioning);
    }
  };

  const handleRestart = async () => {
    clearQuizState();
    const count = Math.max(1, Math.min(questionCount ?? allWords.length ?? DEFAULT_QUESTION_COUNT, allWords.length || DEFAULT_QUESTION_COUNT, MAX_NORMAL_QUIZ_QUESTION_COUNT));
    if (allWords.some((w) => needsDistractors(w) || needsWordOrderQuiz(w))) await startQuizWithDistractors(allWords, count);
    else setQuestions(generateQuestions(allWords, count, quizDirection));
    setCurrentIndex(0); setSelectedIndex(null); setWordOrderSelectedTokens([]); setWordOrderResult(null); setIsRevealed(false);
    setTypeInAnswer(''); setTypeInResult(null);
    setIsTransitioning(false);
    setResults({ correct: 0, total: 0 }); setAnswerResults([]); setIsComplete(false);
  };

  const handleSelectCount = async (count: number) => {
    setQuestionCount(count);
    if (allWords.length > 0) {
      setCurrentIndex(0); setSelectedIndex(null); setWordOrderSelectedTokens([]); setWordOrderResult(null); setIsRevealed(false);
      setTypeInAnswer(''); setTypeInResult(null);
      if (allWords.some((w) => needsDistractors(w) || needsWordOrderQuiz(w))) await startQuizWithDistractors(allWords, count);
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
        <p className="mb-6 text-center text-sm text-[var(--color-muted)]">AI機能がOFFのため、クイズを開始できません。</p>
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
    const { parsedInput: parsed, isValidInput: isValid } = parseQuizQuestionCountInput(inputCount, maxQ);
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
      <div className="ds-fixed-main fixed inset-0 z-30 hidden flex-col items-center justify-center bg-[var(--color-background)] font-[var(--font-body)] lg:flex">
        <div className="ds-card" style={{ padding: '44px 56px', textAlign: 'center', maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--color-warning-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
            <Icon name="trophy" filled style={{ fontSize: 38, color: '#d97706' }} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26 }}>クイズ完了</div>
          <div className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 56, lineHeight: 1.1 }}>
            {results.correct} <span style={{ fontSize: 24, color: 'var(--color-secondary-text)' }}>/ {results.total}</span>
          </div>
          <div className="muted" style={{ fontSize: 14 }}>正答率 {percentage}%</div>
          <div className="ds-prog" style={{ width: '100%', marginTop: 12 }}><div className="fi" style={{ width: `${percentage}%` }} /></div>
          <p className="muted" style={{ margin: '12px 0 14px', fontSize: 14 }}>{completionMessage}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button type="button" className="ds-btn" onClick={handleRestart}><Icon name="replay" />もう一度</button>
            <button type="button" className="ds-btn dark" onClick={reviewMode || learnMode ? goToNextReviewQuiz : backToProject}>
              <Icon name={reviewMode || learnMode ? 'arrow_forward' : 'check'} />
              {reviewMode || learnMode ? '次へ進む' : '終了する'}
            </button>
          </div>
        </div>
      </div>
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
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
  const desktopSubtitle = reviewMode
    ? currentIsWordOrder ? '復習 · 語順クイズ' : '復習 · 4択クイズ'
    : learnMode
      ? currentIsWordOrder ? '未習得の単語 · 語順クイズ' : '未習得の単語 · 4択クイズ'
      : wrongMode
        ? currentIsWordOrder ? '間違えた問題 · 語順クイズ' : '間違えた問題 · 4択クイズ'
        : reminderMode
          ? currentIsWordOrder ? '復習リマインダー · 語順クイズ' : '復習リマインダー · 4択クイズ'
        : favoritesMode
          ? currentIsWordOrder ? '保存済み単語 · 語順クイズ' : '保存済み単語 · 4択クイズ'
      : currentIsWordOrder
        ? '語順クイズ'
        : isActiveVocab
          ? 'タイプ入力'
          : '4択クイズ';
  const desktopPrompt = currentIsWordOrder
    ? currentQuestion?.word.japanese
    : isActiveVocab
      ? currentQuestion?.word.japanese
      : quizDirection === 'en-to-ja'
        ? currentQuestion?.word.english
        : currentQuestion?.word.japanese;
  const desktopPhonetic = !currentIsWordOrder && !isActiveVocab
    ? currentQuestion?.word.pronunciation
    : '';
  const desktopPartOfSpeechLabel = isActiveVocab
    ? formatPartOfSpeechLabels(currentQuestion?.word.partOfSpeechTags)
    : '';
  const desktopMultipleChoiceWrong = (
    selectedIndex !== null &&
    isMultipleChoiceQuestion(currentQuestion) &&
    selectedIndex !== currentQuestion.correctIndex
  );
  const desktopAnswerWrong = typeInResult === 'wrong' || desktopMultipleChoiceWrong || wordOrderResult === 'wrong';
  const desktopCorrectAnswer = currentIsWordOrder
    ? null
    : isActiveVocab
      ? typeInExpectedAnswer
      : isMultipleChoiceQuestion(currentQuestion)
        ? currentQuestion.options[currentQuestion.correctIndex] ?? currentQuestion.word.english
        : null;
  const desktopWordOrderReady = (
    isWordOrderQuestion(currentQuestion) &&
    wordOrderSelectedTokens.length === currentQuestion.answerTokens.length
  );
  const desktopWordOrderAnswer = isWordOrderQuestion(currentQuestion)
    ? currentQuestion.answerTokens.join(' ')
    : '';
  const desktopExample = !currentIsWordOrder && currentQuestion?.word.exampleSentence?.trim()
    ? {
        sentence: currentQuestion.word.exampleSentence.trim(),
        translation: normalizeDisplayText(currentQuestion.word.exampleSentenceJa),
      }
    : null;

  return (
    <>
    <div className="ds-fixed-main fixed inset-0 z-30 hidden flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:flex">
      <div className="ds-quiz-wrap">
        <div className="ds-quiz-head">
          <button type="button" className="x" onClick={backToProject} aria-label="閉じる">
            <Icon name="close" />
          </button>
          <div className="ds-qbar"><div className="fi" style={{ width: `${Math.round((currentIndex / Math.max(total, 1)) * 100)}%` }} /></div>
          <span className="ds-qcount">{currentIndex + 1} <span className="muted" style={{ fontWeight: 500 }}>/ {total}</span></span>
        </div>
        <div className="mono muted" style={{ fontSize: 12, marginTop: 6 }}>{desktopSubtitle}</div>

        {!currentIsWordOrder && (
          <div className="ds-qword">
            <div className="en" style={{ fontSize: desktopPrompt && desktopPrompt.length > 20 ? 42 : undefined }}>{desktopPrompt}</div>
            {isActiveVocab && desktopPartOfSpeechLabel ? (
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
                <span className="ds-tag accent">{desktopPartOfSpeechLabel}</span>
              </div>
            ) : (
              <div className="ph">{desktopPhonetic || '\u00a0'}</div>
            )}
          </div>
        )}

        {isWordOrderQuestion(currentQuestion) ? (
          <DSDesktopWordOrderPanel
            question={currentQuestion}
            selectedTokens={wordOrderSelectedTokens}
            result={wordOrderResult}
            isRevealed={isRevealed}
            onSelectToken={handleWordOrderTokenSelect}
            onRemoveToken={handleWordOrderTokenRemove}
          />
        ) : !isActiveVocab && isMultipleChoiceQuestion(currentQuestion) ? (
          <div className="ds-qopts">
            {currentQuestion.options.map((option, i) => {
              let cls = 'ds-qopt';
              if (isRevealed) {
                if (i === currentQuestion.correctIndex) cls += ' correct';
                else if (i === selectedIndex) cls += ' wrong';
                else cls += ' dim';
              }
              return (
                <button key={i} type="button" className={cls} onClick={() => handleSelect(i)} disabled={isRevealed}>
                  <span className="lbl">{String.fromCharCode(65 + i)}</span>
                  <span style={{ flex: 1 }}>{option}</span>
                  {isRevealed && i === currentQuestion.correctIndex && <Icon name="check" />}
                  {isRevealed && i === selectedIndex && i !== currentQuestion.correctIndex && <Icon name="close" />}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: 520 }}>
            <TypeInQuizField
              answer={typeInExpectedAnswer}
              spaceAsGap={isActiveVocab}
              value={typeInAnswer}
              onChange={setTypeInAnswer}
              normalizeInput={isActiveVocab ? stripActiveQuizAnswerSpaces : undefined}
              onSubmit={() => { if (!isRevealed) handleTypeInSubmit(); }}
              disabled={isRevealed}
              result={typeInResult}
            />
            {!isRevealed && (
              <button
                type="button"
                className="ds-btn accent"
                onClick={handleTypeInSubmit}
                disabled={!typeInAnswer.trim()}
                style={{ width: '100%', marginTop: 16 }}
              >
                回答する
              </button>
            )}
          </div>
        )}

        {isRevealed && desktopExample && (
          <div className="w-full max-w-[780px] rounded-xl border border-dashed border-[var(--color-border)] bg-white p-[13px_14px] text-left" style={{ marginTop: 16 }}>
            <div className="mb-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">EXAMPLE</div>
            <div className="text-sm font-medium leading-[1.55] text-[var(--solid-ink)]">
              {desktopExample.sentence}
            </div>
            {desktopExample.translation && (
              <div className="mt-1 text-xs leading-[1.55] text-[var(--color-muted)]">{desktopExample.translation}</div>
            )}
          </div>
        )}

        <div style={{ height: 64, display: 'flex', alignItems: 'center', marginTop: 16, gap: 14 }}>
          {currentIsWordOrder ? (
            isRevealed ? (
              <>
                <span
                  className="ds-status"
                  style={{
                    color: wordOrderResult === 'wrong' ? 'var(--color-error)' : 'var(--color-accent-ink)',
                    fontSize: 15,
                  }}
                >
                  <Icon name={wordOrderResult === 'wrong' ? 'cancel' : 'check_circle'} filled />
                  {wordOrderResult === 'wrong' ? '不正解' : '正解'}
                </span>
                {wordOrderResult === 'wrong' && (
                  <span className="muted" style={{ fontSize: 13.5 }}>
                    正解：<b style={{ color: 'var(--color-ink)' }}>{desktopWordOrderAnswer}</b>
                  </span>
                )}
                <button type="button" className="ds-btn accent" onClick={moveToNext} disabled={isTransitioning}>
                  次の問題<Icon name="arrow_forward" />
                </button>
              </>
            ) : (
              <>
                {wordOrderSelectedTokens.length > 0 && (
                  <button
                    type="button"
                    className="ds-btn ghost"
                    onClick={() => setWordOrderSelectedTokens([])}
                  >
                    <Icon name="restart_alt" />クリア
                  </button>
                )}
                <button
                  type="button"
                  className="ds-btn accent"
                  disabled={!desktopWordOrderReady}
                  style={!desktopWordOrderReady ? { opacity: 0.5 } : undefined}
                  onClick={handleWordOrderSubmit}
                >
                  <Icon name="check" />答え合わせ
                </button>
              </>
            )
          ) : isRevealed ? (
            <>
              <span
                className="ds-status"
                style={{
                  color: desktopAnswerWrong ? 'var(--color-error)' : 'var(--color-accent-ink)',
                  fontSize: 15,
                }}
              >
                <Icon
                  name={desktopAnswerWrong ? 'cancel' : 'check_circle'}
                  filled
                />
                {desktopAnswerWrong ? '不正解' : '正解'}
              </span>
              {desktopAnswerWrong && desktopCorrectAnswer && (
                <span className="muted" style={{ fontSize: 13.5 }}>
                  正解：<b style={{ color: 'var(--color-ink)' }}>{desktopCorrectAnswer}</b>
                </span>
              )}
              <button type="button" className="ds-btn accent" onClick={moveToNext} disabled={isTransitioning}>
                次の問題<Icon name="arrow_forward" />
              </button>
            </>
          ) : (
            <span className="muted mono" style={{ fontSize: 12 }}>
              {isActiveVocab ? '英単語を入力してください' : '意味として正しいものを選んでください'}
            </span>
          )}
        </div>
      </div>
    </div>

    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
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
          {currentIsWordOrder ? '語順を完成' : isActiveVocab ? 'タイプ入力' : '意味を選ぼう'}
        </div>

        {/* Word display — big solid plate */}
        <div className="relative">
          <div className="absolute inset-0 rounded-[18px] translate-x-[3px] translate-y-[4px] bg-[var(--solid-ink)]" />
          <div className="relative rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] px-[18px] py-6 text-center">
            <div className="font-display text-[34px] font-extrabold leading-[1.1] tracking-[-0.01em] text-[var(--solid-ink)]">
              {currentIsWordOrder
                ? currentQuestion?.word.japanese
                : isActiveVocab
                ? currentQuestion?.word.japanese
                : quizDirection === 'en-to-ja'
                  ? currentQuestion?.word.english
                  : currentQuestion?.word.japanese}
            </div>
            {!isActiveVocab && !currentIsWordOrder && (
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
        {isWordOrderQuestion(currentQuestion) ? (
          <DSWordOrderPanel
            question={currentQuestion}
            selectedTokens={wordOrderSelectedTokens}
            result={wordOrderResult}
            isRevealed={isRevealed}
            onSelectToken={handleWordOrderTokenSelect}
            onRemoveToken={handleWordOrderTokenRemove}
            onSubmit={handleWordOrderSubmit}
          />
        ) : !isActiveVocab && isMultipleChoiceQuestion(currentQuestion) ? (
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
              answer={typeInExpectedAnswer}
              spaceAsGap={isActiveVocab}
              value={typeInAnswer}
              onChange={setTypeInAnswer}
              normalizeInput={isActiveVocab ? stripActiveQuizAnswerSpaces : undefined}
              onSubmit={() => { if (!isRevealed) handleTypeInSubmit(); }}
              disabled={isRevealed}
              result={typeInResult}
              variant="solid"
            />
            {!isRevealed && (
              <SolidButton variant="inverse" onClick={handleTypeInSubmit} disabled={!typeInAnswer.trim()} className="w-full justify-center">
                回答する
              </SolidButton>
            )}
            {isRevealed && typeInResult === 'wrong' && currentQuestion && (
              <div
                className="rounded-xl border-[1.5px] p-3 text-center"
                style={{ borderColor: 'var(--color-accent-ink)', background: 'var(--color-accent)' }}
              >
                <p className="text-sm font-bold text-white/85">正解</p>
                <p className="mt-1 text-lg font-black text-white">
                  {currentQuestion.word.english}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Example sentence revealed */}
        {isRevealed && !currentIsWordOrder && currentQuestion?.word.exampleSentence && (
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
    </>
  );
}
