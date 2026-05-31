'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import {
  generateQuizQuestions,
  applyWordOrderQuestionsToPendingQuiz,
} from '@/lib/quiz/quiz-state';
import {
  WORD_ORDER_BLANK_TOKEN,
  isWordOrderEligible,
  normalizeWordOrderQuizCache,
} from '@/lib/quiz/word-order';
import { playAnswerFeedbackSound } from '@/lib/audio/answer-feedback';
import { useAuth } from '@/hooks/use-auth';
import type {
  Word,
  QuizQuestion,
  WordOrderQuizCache,
  WordOrderQuizQuestion,
  SubscriptionStatus,
} from '@/types';

const DEFAULT_QUESTION_COUNT = 10;
const WORD_ORDER_API_CHUNK_SIZE = 30;

function parseFavoriteQuizQuestionCount(value: string | null): number {
  if (!value) return DEFAULT_QUESTION_COUNT;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUESTION_COUNT;
}

function chipKey(token: string): string {
  return token.trim().toLowerCase();
}

function tokensMatch(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((token, index) => chipKey(token) === chipKey(right[index] ?? ''));
}

function isWordOrderQuestion(question: QuizQuestion | undefined): question is WordOrderQuizQuestion {
  return question?.type === 'word-order';
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

/* ---------- DS-styled word-order panel ---------- */
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
    <div className="mt-[18px] space-y-4">
      <div className="rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-white p-4 shadow-[2px_3px_0_var(--solid-ink)]">
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
                className="inline-flex min-h-10 min-w-[74px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-[15px] font-black text-[var(--solid-ink)] disabled:cursor-default"
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
        <div
          className="rounded-xl border p-3 text-center"
          style={{
            borderColor: result === 'correct' ? 'var(--color-success)' : 'var(--color-error)',
            background: result === 'correct' ? 'rgba(61,122,78,0.08)' : 'rgba(184,72,72,0.08)',
          }}
        >
          <p className="text-sm font-bold text-[var(--solid-ink)]">
            {result === 'correct' ? '正解' : '不正解'}
          </p>
          <p className="mt-1 text-lg font-black text-[var(--solid-ink)]">{question.word.english}</p>
        </div>
      )}
    </div>
  );
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

  const [allFavoriteWords, setAllFavoriteWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [wordOrderSelectedTokens, setWordOrderSelectedTokens] = useState<string[]>([]);
  const [wordOrderResult, setWordOrderResult] = useState<'correct' | 'wrong' | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [results, setResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const [answerResults, setAnswerResults] = useState<(boolean | null)[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const needsWordOrderQuiz = useCallback((w: Word) => {
    if (!isWordOrderEligible(w)) return false;
    return !normalizeWordOrderQuizCache(w, w.wordOrderQuiz);
  }, []);

  const applyGeneratedWordOrderQuizzes = useCallback(async (words: Word[]): Promise<Word[]> => {
    const targets = words.filter(needsWordOrderQuiz).slice(0, WORD_ORDER_API_CHUNK_SIZE);
    if (targets.length === 0) return words;

    try {
      const response = await fetch('/api/generate-word-order-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: targets.map((w) => ({ id: w.id, english: w.english, japanese: w.japanese })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.results)) {
        throw new Error(data?.error || 'failed');
      }

      const targetsById = new Map(targets.map((w) => [w.id, w]));
      const generated = new Map<string, WordOrderQuizCache>();
      for (const result of data.results as Array<{ wordId?: unknown; quiz?: unknown }>) {
        if (typeof result.wordId !== 'string') continue;
        const word = targetsById.get(result.wordId);
        if (!word) continue;
        const quiz = normalizeWordOrderQuizCache(word, result.quiz);
        if (quiz) generated.set(word.id, quiz);
      }
      if (generated.size === 0) return words;

      await Promise.all([...generated.entries()].map(([wordId, wordOrderQuiz]) =>
        repository.updateWord(wordId, { wordOrderQuiz }).catch(() => {})
      ));

      return words.map((w) => {
        const quiz = generated.get(w.id);
        return quiz ? { ...w, wordOrderQuiz: quiz } : w;
      });
    } catch {
      return words;
    }
  }, [needsWordOrderQuiz, repository]);

  useEffect(() => {
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
            if (localProject?.userId === ownerUserId) return true;
          } catch { /* continue */ }
          if (user) {
            try {
              const remoteProject = await remoteRepository.getProject(projectId);
              return remoteProject?.userId === ownerUserId;
            } catch { /* continue */ }
          }
          return false;
        };

        let favoriteWords: Word[];

        if (projectId === 'all') {
          const userId = user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const allWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
          favoriteWords = allWords.flat().filter(w => w.isFavorite);
        } else {
          const hasAccess = await ensureProjectAccess();
          if (!hasAccess) { backToProject(); return; }
          const words = await repository.getWords(projectId);
          favoriteWords = words.filter((w) => w.isFavorite);
        }

        if (favoriteWords.length === 0) { backToProject(); return; }

        setAllFavoriteWords(favoriteWords);

        const generated = generateQuizQuestions(favoriteWords, questionCount, 'en-to-ja', shuffleArray, {
          allowPendingWordOrderFallback: true,
        });
        setQuestions(generated);
        setAnswerResults(Array.from({ length: generated.length }, () => null));

        // background: generate word-order quiz data for eligible words that lack it
        const wordOrderTargets = favoriteWords.filter(needsWordOrderQuiz);
        if (wordOrderTargets.length > 0) {
          void applyGeneratedWordOrderQuizzes(favoriteWords).then((updatedWords) => {
            setAllFavoriteWords(updatedWords);
            setQuestions((prev) =>
              applyWordOrderQuestionsToPendingQuiz(prev, updatedWords, currentIndexRef.current)
            );
          });
        }
      } catch {
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    void loadWords();
  }, [projectId, repository, router, authLoading, isPro, questionCount, user, backToProject, needsWordOrderQuiz, applyGeneratedWordOrderQuizzes]);

  const currentQuestion = questions[currentIndex];
  const currentIsWordOrder = isWordOrderQuestion(currentQuestion);

  const handleSelect = (index: number) => {
    if (isRevealed || selectedIndex !== null || !currentQuestion || currentIsWordOrder) return;

    setSelectedIndex(index);
    setIsRevealed(true);

    const mcQuestion = currentQuestion as { correctIndex: number };
    const isCorrect = index === mcQuestion.correctIndex;
    playAnswerFeedbackSound(isCorrect);
    setResults((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    setAnswerResults((prev) => {
      const next = [...prev];
      next[currentIndex] = isCorrect;
      return next;
    });
  };

  const handleWordOrderTokenSelect = (token: string) => {
    if (isRevealed || !currentIsWordOrder) return;
    const woQuestion = currentQuestion as WordOrderQuizQuestion;
    if (wordOrderSelectedTokens.length >= woQuestion.answerTokens.length) return;
    setWordOrderSelectedTokens((prev) => [...prev, token]);
  };

  const handleWordOrderTokenRemove = (index: number) => {
    if (isRevealed) return;
    setWordOrderSelectedTokens((prev) => prev.filter((_, i) => i !== index));
  };

  const handleWordOrderSubmit = () => {
    if (isRevealed || !currentIsWordOrder) return;
    const woQuestion = currentQuestion as WordOrderQuizQuestion;
    const isCorrect = tokensMatch(wordOrderSelectedTokens, woQuestion.answerTokens);
    playAnswerFeedbackSound(isCorrect);
    setWordOrderResult(isCorrect ? 'correct' : 'wrong');
    setIsRevealed(true);
    setResults((prev) => ({ correct: prev.correct + (isCorrect ? 1 : 0), total: prev.total + 1 }));
    setAnswerResults((prev) => {
      const next = [...prev];
      next[currentIndex] = isCorrect;
      return next;
    });
  };

  const moveToNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setWordOrderSelectedTokens([]);
      setWordOrderResult(null);
      setIsRevealed(false);
      setIsTransitioning(false);
    }
  };

  const handleRestart = () => {
    const regenerated = generateQuizQuestions(allFavoriteWords, questionCount, 'en-to-ja', shuffleArray, {
      allowPendingWordOrderFallback: true,
    });
    setQuestions(regenerated);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setWordOrderSelectedTokens([]);
    setWordOrderResult(null);
    setIsRevealed(false);
    setResults({ correct: 0, total: 0 });
    setAnswerResults(Array.from({ length: regenerated.length }, () => null));
    setIsComplete(false);
    setIsTransitioning(false);
  };

  const handleToggleFavorite = async () => {
    if (!currentQuestion) return;
    const word = currentQuestion.word;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(word.id, { isFavorite: newFavorite });
    setQuestions((prev) =>
      prev.map((q, i) => i === currentIndex ? { ...q, word: { ...q.word, isFavorite: newFavorite } } : q)
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--color-background)] font-[var(--font-body)] lg:left-[280px]">
        <Icon name="progress_activity" size={22} className="animate-spin text-[var(--color-muted)]" />
        <span className="ml-2 text-sm text-[var(--color-muted)]">保存済みクイズを準備中...</span>
      </div>
    );
  }

  if (isComplete) {
    const percentage = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    const message =
      percentage === 100 ? '全問正解！素晴らしい！'
      : percentage >= 80 ? 'よくできました！'
      : percentage >= 60 ? '頑張りました！繰り返し練習しましょう'
      : '保存した単語をもう一度確認しましょう';

    return (
      <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[var(--color-background)] font-[var(--font-body)] lg:left-[280px]">
        <button
          type="button"
          onClick={backToProject}
          className="absolute left-4 inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]"
          style={{ top: 'max(8px, calc(env(safe-area-inset-top) + 8px))' }}
        >
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
            <p className="mb-8 text-[var(--solid-ink)]">{message}</p>
            <div className="space-y-3">
              <SolidButton variant="inverse" onClick={handleRestart} iconLeft="refresh" className="w-full justify-center">もう一度</SolidButton>
              <SolidButton onClick={backToProject} className="w-full justify-center">単語一覧に戻る</SolidButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const total = questions.length;

  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:left-[280px]">
      {/* Header */}
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
          onClick={() => void handleToggleFavorite()}
          className="inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]"
        >
          <Icon name="bookmark" size={19} filled={currentQuestion?.word.isFavorite ?? false} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-2.5">
        <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          {currentIsWordOrder ? '語順を完成' : '意味を選ぼう'}
        </div>

        {/* Word display */}
        <div className="relative">
          <div className="absolute inset-0 rounded-[18px] translate-x-[3px] translate-y-[4px] bg-[var(--solid-ink)]" />
          <div className="relative rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] px-[18px] py-6 text-center">
            <div className="font-display text-[34px] font-extrabold leading-[1.1] tracking-[-0.01em] text-[var(--solid-ink)]">
              {currentIsWordOrder
                ? (currentQuestion as WordOrderQuizQuestion).word.japanese
                : currentQuestion?.word.english}
            </div>
            {!currentIsWordOrder && (
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

        {/* Word-order panel or multiple-choice options */}
        {currentIsWordOrder ? (
          <DSWordOrderPanel
            question={currentQuestion as WordOrderQuizQuestion}
            selectedTokens={wordOrderSelectedTokens}
            result={wordOrderResult}
            isRevealed={isRevealed}
            onSelectToken={handleWordOrderTokenSelect}
            onRemoveToken={handleWordOrderTokenRemove}
            onSubmit={handleWordOrderSubmit}
          />
        ) : (
          <div className="mt-[18px] flex flex-col gap-2">
            {(currentQuestion as { options?: string[] })?.options?.map((option, i) => (
              <DSQuizOption
                key={i}
                label={option}
                index={i}
                isSelected={selectedIndex === i}
                isCorrect={i === (currentQuestion as { correctIndex: number }).correctIndex}
                isRevealed={isRevealed}
                onSelect={() => handleSelect(i)}
                disabled={isRevealed}
              />
            ))}
          </div>
        )}

        {/* Example sentence */}
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

      {/* Bottom CTA */}
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
