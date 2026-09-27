'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { SolidButton } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/modal';
import { QuizModeChooser } from '@/components/quiz';
import {
  QUIZ_FORMAT_QUERY_KEY,
  writeQuizMode,
  type QuizMode,
} from '@/lib/quiz/quiz-mode-preference';
import { getRepository } from '@/lib/db';
import { getWordsByProjectMap } from '@/lib/projects/load-helpers';
import { cn, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { calculateNextReview, getStatusAfterAnswer } from '@/lib/spaced-repetition';
import { playAnswerFeedbackSound } from '@/lib/audio/answer-feedback';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase';
import {
  attributionAuthor,
  pickClozeRequestWords,
  resolveClozeQuizCount,
  tatoebaSentenceUrl,
  toClozeWordInput,
} from '@/lib/cloze/client';
import type { ClozeQuestion } from '@/lib/cloze/question';
import type { Word, SubscriptionStatus } from '@/types';

const SOLID_SURFACE =
  'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]';
const HARD_SHADOW = 'shadow-[3px_4px_0_var(--solid-shadow)]';
const HARD_SHADOW_SM = 'shadow-[2px_3px_0_var(--solid-shadow)]';
const EYEBROW = 'font-mono text-[10px] font-black uppercase tracking-[0.14em]';

/**
 * 認証付きAPIの見出し。音読チャレンジと同じ理由で、アクセストークンを明示的に載せる
 * (ホーム画面に追加した iOS の PWA は Cookie が Safari と別になり、401 になることがある)。
 */
async function authorizedHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await createBrowserClient().auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  } catch {
    // 取れなければ Cookie に任せる
  }
  return headers;
}

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'login-required';

/**
 * 空所補充クイズ (英検大問1形式)。
 *
 * 英文の空欄に入る語を4つから選ぶ。出題文は Tatoeba の対訳コーパス、誤答は共通の
 * 語彙マスターから同じ品詞・近い難しさの語を選ぶので、AI を呼ばない (コインも消費しない)。
 * Tatoeba の文は CC BY 2.0 FR なので、毎問の下に作者とライセンスを必ず出す。
 */
export default function ClozeQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const returnPath = searchParams.get('from');
  /** `/cloze-quiz/all?binder=<名前>` はバインダー内の単語帳をまとめて出す。 */
  const binderName = projectId === 'all' ? searchParams.get('binder') : null;
  const requestedCount = resolveClozeQuizCount(searchParams.get('count'));
  const { subscription, loading: authLoading, user } = useAuth();
  // 読み込みは ID の変化にだけ反応させる。トークン更新で user が作り直されるたびに
  // 出題を組み直すと、解いている途中の問題が入れ替わってしまう。
  const userId = user?.id ?? null;

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [wordsById, setWordsById] = useState<Map<string, Word>>(new Map());
  const [questions, setQuestions] = useState<ClozeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [results, setResults] = useState({ correct: 0, total: 0 });
  const [isComplete, setIsComplete] = useState(false);
  const [showModeSwitch, setShowModeSwitch] = useState(false);
  /** 「もう一度」で出題を組み直すための番号。 */
  const [round, setRound] = useState(0);

  const backToProject = useCallback(() => {
    const fallback = binderName ? `/binder/${encodeURIComponent(binderName)}` : `/project/${projectId}`;
    router.replace(returnPath || fallback);
  }, [router, returnPath, projectId, binderName]);

  /** 他の解き方へ移る。出題数・バインダー・戻り先は引き継ぐ。 */
  const chooseMode = useCallback(
    (mode: QuizMode) => {
      setShowModeSwitch(false);
      if (mode === 'cloze') return;
      writeQuizMode(mode);
      const next = new URLSearchParams({ count: String(requestedCount) });
      if (binderName) next.set('binder', binderName);
      if (returnPath) next.set('from', returnPath);
      if (mode === 'voice') {
        router.replace(`/voice-quiz/${projectId}?${next.toString()}`);
        return;
      }
      next.set(QUIZ_FORMAT_QUERY_KEY, mode);
      router.replace(`/quiz/${projectId}?${next.toString()}`);
    },
    [router, projectId, binderName, returnPath, requestedCount],
  );

  // 単語を読み込み、出題を組んでもらう。
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const load = async () => {
      setLoadState('loading');
      try {
        // 出題文と誤答はサーバーの共通マスターから引くので、ログインが要る。
        if (!userId) {
          setLoadState('login-required');
          return;
        }

        const ownerUserId = userId;
        let loaded: Word[];
        if (binderName) {
          const projects = await repository.getProjects(ownerUserId);
          const ids = projects.filter((p) => (p.binder?.trim() ?? '') === binderName).map((p) => p.id);
          if (ids.length === 0) {
            backToProject();
            return;
          }
          const wordsByProject = await getWordsByProjectMap(repository, ids);
          loaded = ids.flatMap((id) => wordsByProject[id] ?? []);
        } else if (projectId === 'all') {
          // 単語帳をまたぐ出題 (復習など) は扱えない。行き止まりにせず四択へ渡す。
          chooseMode('normal');
          return;
        } else {
          const project = await repository.getProject(projectId);
          if (!project || project.userId !== ownerUserId) {
            backToProject();
            return;
          }
          loaded = await repository.getWords(projectId);
        }

        const requestWords = pickClozeRequestWords(loaded, requestedCount);
        if (requestWords.length === 0) {
          if (!cancelled) setLoadState('empty');
          return;
        }

        const response = await fetch('/api/cloze/questions', {
          method: 'POST',
          headers: await authorizedHeaders(),
          body: JSON.stringify({ words: requestWords.map(toClozeWordInput), limit: requestedCount }),
        });
        if (response.status === 401) {
          if (!cancelled) setLoadState('login-required');
          return;
        }
        if (!response.ok) throw new Error(`cloze questions: ${response.status}`);
        const body = (await response.json()) as { questions?: ClozeQuestion[] };
        if (cancelled) return;

        const built = body.questions ?? [];
        setWordsById(new Map(requestWords.map((word) => [word.id, word])));
        setQuestions(built);
        setCurrentIndex(0);
        setSelectedIndex(null);
        setResults({ correct: 0, total: 0 });
        setIsComplete(false);
        setLoadState(built.length > 0 ? 'ready' : 'empty');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, projectId, binderName, repository, requestedCount, backToProject, chooseMode, round]);

  const question = questions[currentIndex] ?? null;
  const isRevealed = selectedIndex !== null;

  /** 選択肢を選んだ。判定を出し、学習記録 (SM-2・正誤) を残す。 */
  const answer = useCallback(
    async (optionIndex: number) => {
      if (!question || selectedIndex !== null) return;
      const correct = optionIndex === question.correctIndex;
      setSelectedIndex(optionIndex);
      playAnswerFeedbackSound(correct);
      setResults((prev) => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));

      const word = wordsById.get(question.wordId);
      if (!word) return;
      // バインダー横断では projectId が擬似IDなので、語が実際に属する単語帳に記録する
      const recordProjectId = binderName ? word.projectId : projectId;
      if (correct) recordCorrectAnswer(false);
      else recordWrongAnswer(word.id, word.english, word.japanese, recordProjectId, word.distractors);
      recordActivity();

      try {
        const newStatus = getStatusAfterAnswer(word.status, correct);
        const updates = { status: newStatus, ...calculateNextReview(correct, word) };
        const becameMastered = word.status !== 'mastered' && newStatus === 'mastered';
        await repository.updateWord(word.id, updates);
        setWordsById((prev) => new Map(prev).set(word.id, { ...word, ...updates }));
        if (userId) {
          fetch('/api/quiz-sessions/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wordId: word.id,
              projectId: recordProjectId,
              english: word.english,
              japanese: word.japanese,
              becameMastered,
              isCorrect: correct,
            }),
          }).catch((error) => {
            console.warn('Failed to record quiz session event:', error);
          });
        }
      } catch {
        // 記録に失敗しても出題は続ける
      }
    },
    [question, selectedIndex, wordsById, binderName, projectId, repository, userId],
  );

  const goNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
      return;
    }
    setCurrentIndex((index) => index + 1);
    setSelectedIndex(null);
  }, [currentIndex, questions.length]);

  // --- Render ---

  if (authLoading || loadState === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">問題を準備中...</p>
        </div>
      </div>
    );
  }

  if (loadState === 'login-required') {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="lock"
        title="ログインが必要です"
        message="空所補充の問題はログインすると解けます。"
      />
    );
  }

  if (loadState === 'error') {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="error"
        title="問題の準備に失敗しました"
        message="通信状況を確認して、もう一度お試しください。"
        action={{ label: 'もう一度試す', onClick: () => setRound((value) => value + 1) }}
      />
    );
  }

  if (loadState === 'empty') {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="search_off"
        title="空所補充の問題を作れませんでした"
        message="この単語帳の単語が入った例文が見つかりませんでした。熟語や、例文の少ない難しい単語は出題できないことがあります。"
        action={{ label: '四択で解く', onClick: () => chooseMode('normal') }}
      />
    );
  }

  if (isComplete) {
    const percentage = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    return (
      <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 flex-shrink-0 p-4 safe-area-top">
          <CloseButton onClick={backToProject} />
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-7 text-center animate-fade-in-up')}>
            <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Result</p>
            <p className="mt-2 font-display text-5xl font-black text-[var(--solid-ink)]">
              {percentage}
              <span className="text-2xl">%</span>
            </p>
            <div className="mx-auto mt-4 h-3 w-full overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
              <div
                className="h-full bg-[var(--color-accent)] transition-[width] duration-700 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="mt-4 text-sm font-bold text-[var(--color-muted)]">
              {results.correct} / {results.total} 問正解
            </p>
            <div className="mt-7 space-y-3">
              <SolidButton
                variant="accent"
                size="lg"
                iconLeft="refresh"
                onClick={() => setRound((value) => value + 1)}
                className={cn('w-full', HARD_SHADOW)}
              >
                新しい問題で解く
              </SolidButton>
              <SolidButton size="lg" onClick={backToProject} className={cn('w-full', HARD_SHADOW_SM)}>
                単語一覧に戻る
              </SolidButton>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!question) return null;

  const answerText = question.options[question.correctIndex];
  const word = wordsById.get(question.wordId);
  const { attribution } = question;

  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 flex items-center gap-3 p-4 safe-area-top">
        <CloseButton onClick={backToProject} />
        <div className="flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
            <div
              className="h-full bg-[var(--color-accent)] transition-[width] duration-300"
              style={{ width: `${((currentIndex + (isRevealed ? 1 : 0)) / questions.length) * 100}%` }}
            />
          </div>
        </div>
        <span className="font-mono text-xs font-black text-[var(--solid-ink)]">
          {currentIndex + 1}/{questions.length}
        </span>
        <button
          type="button"
          onClick={() => setShowModeSwitch(true)}
          aria-label="解き方を変える"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]',
            HARD_SHADOW_SM,
          )}
        >
          <Icon name="tune" size={20} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-6">
        <div className="mx-auto w-full max-w-md">
          <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Fill in the blank</p>
          <p className="mt-1 text-xs font-bold text-[var(--color-muted)]">空欄に入る最も適切な語を選んでください</p>

          <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'mt-3 p-5')}>
            <p className="font-display text-lg font-bold leading-8 text-[var(--solid-ink)]" lang="en">
              {question.before}
              <span
                className={cn(
                  'mx-0.5 inline-block min-w-[4.5em] border-b-2 px-1 text-center',
                  isRevealed
                    ? 'border-[var(--color-success)] text-[var(--color-success)]'
                    : 'border-[var(--solid-ink)] text-transparent',
                )}
                aria-label={isRevealed ? answerText : '空欄'}
              >
                {isRevealed ? answerText : '＿'}
              </span>
              {question.after}
            </p>
            {isRevealed && (
              <p className="mt-3 border-t-2 border-dashed border-[var(--color-border)] pt-3 text-sm leading-6 text-[var(--color-muted)]">
                {question.sentenceJa}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5">
            {question.options.map((option, index) => {
              const isCorrectOption = index === question.correctIndex;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={`${currentIndex}-${option}`}
                  type="button"
                  disabled={isRevealed}
                  onClick={() => void answer(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] px-4 py-3 text-left transition-all duration-100 active:translate-x-px active:translate-y-px',
                    HARD_SHADOW_SM,
                    !isRevealed && 'bg-[var(--color-surface)]',
                    isRevealed && isCorrectOption && 'bg-[var(--color-success-light)]',
                    isRevealed && isSelected && !isCorrectOption && 'bg-[var(--color-error-light)]',
                    isRevealed && !isSelected && !isCorrectOption && 'bg-[var(--color-surface)] opacity-60',
                  )}
                >
                  <span className="font-mono text-xs font-black text-[var(--color-muted)]">{index + 1}</span>
                  <span className="flex-1 font-display text-base font-black text-[var(--solid-ink)]" lang="en">
                    {option}
                  </span>
                  {isRevealed && isCorrectOption && <Icon name="check_circle" size={20} className="text-[var(--color-success)]" />}
                  {isRevealed && isSelected && !isCorrectOption && <Icon name="cancel" size={20} className="text-[var(--color-error)]" />}
                </button>
              );
            })}
          </div>

          {isRevealed && (
            <div className="mt-4 animate-fade-in-up">
              {word && (
                <p className="text-sm font-bold text-[var(--solid-ink)]">
                  <span lang="en">{word.english}</span>
                  <span className="ml-2 text-[var(--color-muted)]">{word.japanese}</span>
                </p>
              )}
              <SolidButton
                variant="accent"
                size="lg"
                iconRight="arrow_forward"
                onClick={goNext}
                className={cn('mt-3 w-full', HARD_SHADOW)}
              >
                {currentIndex + 1 >= questions.length ? '結果を見る' : '次へ'}
              </SolidButton>
            </div>
          )}

          {/* 出典表示。CC BY 2.0 FR の利用条件なので、毎問必ず出す。 */}
          <p className="mt-5 text-[10px] leading-4 text-[var(--color-muted)]">
            例文:{' '}
            <a href={tatoebaSentenceUrl(attribution.enSentenceId)} target="_blank" rel="noopener noreferrer" className="underline">
              #{attribution.enSentenceId}
            </a>{' '}
            {attributionAuthor(attribution.enAuthor)} / {attribution.enLicense}
            {isRevealed && (
              <>
                {' '}・ 和訳:{' '}
                <a href={tatoebaSentenceUrl(attribution.jaSentenceId)} target="_blank" rel="noopener noreferrer" className="underline">
                  #{attribution.jaSentenceId}
                </a>{' '}
                {attributionAuthor(attribution.jaAuthor)} / {attribution.jaLicense}
              </>
            )}
          </p>
        </div>
      </main>

      <Modal
        isOpen={showModeSwitch}
        onClose={() => setShowModeSwitch(false)}
        showCloseButton={false}
        className="border-0 bg-transparent p-0 shadow-none"
      >
        <QuizModeChooser
          current="cloze"
          onSelect={chooseMode}
          onCancel={() => setShowModeSwitch(false)}
          title="クイズの解き方を変える"
          description="いまの空所補充をやめて、選んだ解き方に切り替えます。"
        />
      </Modal>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="閉じる"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px',
        HARD_SHADOW_SM,
      )}
    >
      <Icon name="close" size={20} />
    </button>
  );
}

function NoticeScreen({
  onBack,
  icon,
  title,
  message,
  action,
}: {
  onBack: () => void;
  icon: string;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 p-4 safe-area-top">
        <CloseButton onClick={onBack} />
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-7 text-center animate-fade-in-up')}>
          <div
            className={cn(
              'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-warning-light)]',
              HARD_SHADOW_SM,
            )}
          >
            <Icon name={icon} size={30} className="text-[var(--color-warning)]" />
          </div>
          <p className="font-display text-lg font-black leading-snug text-[var(--solid-ink)]">{title}</p>
          <p className="mt-3 mb-6 text-sm leading-6 text-[var(--color-muted)]">{message}</p>
          {action && (
            <SolidButton variant="accent" size="lg" onClick={action.onClick} className={cn('mb-3 w-full', HARD_SHADOW)}>
              {action.label}
            </SolidButton>
          )}
          <SolidButton size="lg" onClick={onBack} className={cn('w-full', HARD_SHADOW_SM)}>
            戻る
          </SolidButton>
        </div>
      </main>
    </div>
  );
}
