'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { SolidButton } from '@/components/redesign/SolidPage';
import { Modal } from '@/components/ui/modal';
import {
  QuizModeChooser,
  QuizProgressBoard,
  QuizRoundStatus,
  type QuizBoardResult,
  type QuizRoundOutcome,
} from '@/components/quiz';
import {
  BattleChoiceButton,
  BattleHeaderButton,
  BattleNotice,
  BattleQuestionCard,
  BattleScreen,
  BattleScreenHeader,
  BattleWaitingPanel,
  type BattleChoiceState,
} from '@/components/battle';
import {
  QUIZ_FORMAT_QUERY_KEY,
  writeQuizMode,
  type QuizMode,
} from '@/lib/quiz/quiz-mode-preference';
import { getRepository } from '@/lib/db';
import { getWordsByProjectMap } from '@/lib/projects/load-helpers';
import { cn, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { calculateNextReview, getProgressAfterAnswer } from '@/lib/spaced-repetition';
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
  /** 問題ごとの結果 (ヘッダの進捗帯に出す)。 */
  const [answerResults, setAnswerResults] = useState<QuizBoardResult[]>([]);
  const [showAttribution, setShowAttribution] = useState(false);
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
        setAnswerResults([]);
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
      // -1 は「わからない」。正解を見せ、学習記録は不正解として残す。
      const skipped = optionIndex < 0;
      const correct = optionIndex === question.correctIndex;
      setSelectedIndex(optionIndex);
      if (!skipped) playAnswerFeedbackSound(correct);
      setResults((prev) => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));
      setAnswerResults((prev) => {
        const next = [...prev];
        next[currentIndex] = skipped ? 'skip' : correct;
        return next;
      });

      const word = wordsById.get(question.wordId);
      if (!word) return;
      // バインダー横断では projectId が擬似IDなので、語が実際に属する単語帳に記録する
      const recordProjectId = binderName ? word.projectId : projectId;
      if (correct) recordCorrectAnswer(false);
      else recordWrongAnswer(word.id, word.english, word.japanese, recordProjectId, word.distractors);
      recordActivity();

      try {
        const updates = { ...getProgressAfterAnswer(word, correct), ...calculateNextReview(correct, word) };
        const becameMastered = word.status !== 'mastered' && updates.status === 'mastered';
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
    [question, selectedIndex, currentIndex, wordsById, binderName, projectId, repository, userId],
  );

  const goNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
      return;
    }
    setCurrentIndex((index) => index + 1);
    setSelectedIndex(null);
  }, [currentIndex, questions.length]);

  /** 「わからない」。正解を見せ、記録は不正解として残す (盤面の印は「わからない」)。 */
  const skip = useCallback(() => {
    if (!question || selectedIndex !== null) return;
    void answer(-1);
  }, [question, selectedIndex, answer]);

  // --- Render ---

  const header = (children?: ReactNode) => (
    <BattleScreenHeader
      wide
      bordered={false}
      title="空所補充"
      onBack={backToProject}
      right={
        children ? (
          <div className="flex items-center gap-2">
            <BattleHeaderButton icon="info" label="例文の出典" onClick={() => setShowAttribution(true)} />
            <BattleHeaderButton icon="swap_horiz" label="クイズの解き方を変える" onClick={() => setShowModeSwitch(true)} />
          </div>
        ) : undefined
      }
    >
      {children}
    </BattleScreenHeader>
  );

  if (authLoading || loadState === 'loading') {
    return (
      <BattleScreen center wide header={header()}>
        <BattleWaitingPanel icon="edit_note" title="問題を準備中" />
      </BattleScreen>
    );
  }

  if (loadState === 'login-required') {
    return (
      <BattleScreen center wide header={header()}>
        <BattleNotice
          icon="lock"
          title="ログインが必要です"
          description="空所補充の問題はログインすると解けます。"
          secondaryAction={{ label: '戻る', onClick: backToProject }}
        />
      </BattleScreen>
    );
  }

  if (loadState === 'error') {
    return (
      <BattleScreen center wide header={header()}>
        <BattleNotice
          icon="error"
          title="問題の準備に失敗しました"
          description="通信状況を確認して、もう一度お試しください。"
          action={{ label: 'もう一度試す', onClick: () => setRound((value) => value + 1) }}
          secondaryAction={{ label: '戻る', onClick: backToProject }}
        />
      </BattleScreen>
    );
  }

  if (loadState === 'empty') {
    return (
      <BattleScreen center wide header={header()}>
        <BattleNotice
          icon="search_off"
          title="空所補充の問題を作れませんでした"
          description="この単語帳の単語が入った例文が見つかりませんでした。熟語や、例文の少ない難しい単語は出題できないことがあります。"
          action={{ label: '四択で解く', onClick: () => chooseMode('normal') }}
          secondaryAction={{ label: '戻る', onClick: backToProject }}
        />
      </BattleScreen>
    );
  }

  if (isComplete) {
    const percentage = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    return (
      <BattleScreen center wide header={header()}>
        <div className="mx-auto w-full max-w-sm rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-7 text-center shadow-[3px_4px_0_var(--solid-shadow)] animate-fade-in-up">
          <p className="font-display text-5xl font-black text-[var(--solid-ink)]">
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
              className="w-full justify-center"
            >
              新しい問題で解く
            </SolidButton>
            <SolidButton size="lg" onClick={backToProject} className="w-full justify-center">
              単語一覧に戻る
            </SolidButton>
          </div>
        </div>
      </BattleScreen>
    );
  }

  if (!question) return null;

  const answerText = question.options[question.correctIndex];
  const word = wordsById.get(question.wordId);
  const { attribution } = question;
  const skipped = selectedIndex === -1;
  const outcome: QuizRoundOutcome = !isRevealed
    ? 'live'
    : skipped
      ? 'skip'
      : selectedIndex === question.correctIndex
        ? 'correct'
        : 'wrong';
  const choiceState = (index: number): BattleChoiceState => {
    if (!isRevealed) return 'idle';
    if (index === question.correctIndex) return 'correct';
    if (index === selectedIndex) return 'wrong';
    return 'muted';
  };

  return (
    <>
      <BattleScreen
        fill
        wide
        bodyClassName="pt-3"
        header={header(
          <QuizProgressBoard
            total={questions.length}
            currentIndex={currentIndex}
            answerResults={answerResults}
            correct={results.correct}
          />,
        )}
      >
        <div className="flex min-h-[120px] flex-1 items-center justify-center py-2">
          <BattleQuestionCard
            round={currentIndex + 1}
            label={`Q${currentIndex + 1}`}
            prompt={`${question.before}___${question.after}`}
            promptNode={
              <span className="block text-left text-[20px] font-bold leading-[1.6] tracking-normal" lang="en">
                {question.before}
                <span
                  className={cn(
                    'mx-0.5 inline-block min-w-[4.5em] border-b-2 px-1 text-center',
                    // 正誤の色は一般・タイムアタックの選択肢と揃える (正解 = accent / 不正解・わからない = error)
                    !isRevealed
                      ? 'border-[var(--solid-ink)] text-transparent'
                      : outcome === 'correct'
                        ? 'border-[var(--color-accent-ink)] text-[var(--color-accent-ink)]'
                        : 'border-[var(--color-error)] text-[var(--color-error)]',
                  )}
                  aria-label={isRevealed ? answerText : '空欄'}
                >
                  {isRevealed ? answerText : '＿'}
                </span>
                {question.after}
              </span>
            }
            // 答える前に読み上げると空欄の語が聞こえてしまうので、答えたあとだけ出す
            speakText={isRevealed ? `${question.before}${answerText}${question.after}` : null}
          >
            {isRevealed && (
              <div className="mt-3 border-t-2 border-dashed border-[var(--color-border)] pt-3 text-left text-sm leading-6 text-[var(--color-muted)]">
                {question.sentenceJa}
              </div>
            )}
          </BattleQuestionCard>
        </div>

        {/* 結果の帯は高さを確保した枠に出す (出入りで盤面がずれない) */}
        <div className="flex h-[40px] shrink-0 items-center justify-center">
          <QuizRoundStatus outcome={outcome} />
        </div>

        <div className="grid min-h-[200px] flex-[1.15] grid-cols-2 grid-rows-2 gap-2.5">
          {question.options.map((option, index) => (
            <BattleChoiceButton
              key={`${currentIndex}-${index}`}
              label={option}
              index={index}
              state={choiceState(index)}
              onSelect={() => void answer(index)}
            />
          ))}
        </div>

        {!isRevealed && (
          <button
            type="button"
            onClick={skip}
            className="mt-3 w-full shrink-0 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-center text-[14px] font-bold text-[var(--color-muted)]"
          >
            わからない
          </button>
        )}

        {isRevealed && (
          <div className="shrink-0 pt-3">
            {word && (
              <p className="mb-2 text-sm font-bold text-[var(--solid-ink)]">
                <span lang="en">{word.english}</span>
                <span className="ml-2 text-[var(--color-muted)]">{word.japanese}</span>
              </p>
            )}
            <SolidButton
              variant="accent"
              iconRight="chevron_right"
              onClick={goNext}
              className="w-full justify-center tablet:min-h-[56px] tablet:text-[16px]"
            >
              {currentIndex + 1 >= questions.length ? '結果を見る' : '次へ'}
            </SolidButton>
          </div>
        )}

      </BattleScreen>

      {/* 例文の出典。Tatoeba の文は CC BY 2.0 FR なので、毎問ここから作者・ライセンス・文IDを辿れるようにしておく。 */}
      <Modal isOpen={showAttribution} onClose={() => setShowAttribution(false)}>
        <h2 className="mb-3 font-display text-[17px] font-black text-[var(--solid-ink)]">例文の出典</h2>
        <dl className="space-y-3 text-sm leading-6 text-[var(--solid-ink)]">
          <div>
            <dt className="font-bold">英文</dt>
            <dd>
              <a href={tatoebaSentenceUrl(attribution.enSentenceId)} target="_blank" rel="noopener noreferrer" className="underline">
                Tatoeba #{attribution.enSentenceId}
              </a>{' '}
              {attributionAuthor(attribution.enAuthor)} / {attribution.enLicense}
            </dd>
          </div>
          <div>
            <dt className="font-bold">和訳</dt>
            <dd>
              <a href={tatoebaSentenceUrl(attribution.jaSentenceId)} target="_blank" rel="noopener noreferrer" className="underline">
                Tatoeba #{attribution.jaSentenceId}
              </a>{' '}
              {attributionAuthor(attribution.jaAuthor)} / {attribution.jaLicense}
            </dd>
          </div>
        </dl>
      </Modal>

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
          description="今日はこのあともこの解き方で始めます。"
        />
      </Modal>
    </>
  );
}
