'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '@/components/ui';
import { SolidButton } from '@/components/redesign/SolidPage';
import { LevelTestResultCard } from '@/components/level-test/LevelTestResultCard';
import { LevelTestShareSheet } from '@/components/level-test/LevelTestShareSheet';
import { useAuth } from '@/hooks/use-auth';
import { playAnswerFeedbackSound } from '@/lib/audio/answer-feedback';
import { triggerHaptic } from '@/lib/haptics';
import { loadLevelTestBank, type LevelTestBank } from '@/lib/level-test/bank';
import {
  EIKEN_LEVEL_LABELS,
  LEVEL_TEST_QUESTION_COUNT,
  answerQuestion,
  buildQuestion,
  buildResult,
  createInitialState,
  isFinished,
  pickQuestionIndex,
  usedKeyFor,
  type LevelTestEvent,
  type LevelTestQuestion,
  type LevelTestState,
} from '@/lib/level-test/engine';
import { encodeLevelTestResult, decodeLevelTestResult, type LevelTestResultPayload } from '@/lib/level-test/result-code';
import {
  clearLevelTestSession,
  loadLevelTestSession,
  saveLevelTestSession,
} from '@/lib/level-test/session';

// 語彙レベル診断。未ログインで完全動作し、DBには一切アクセスしない
// (問題バンクは静的JSON、結果はURLに符号化)。

type Screen = 'start' | 'quiz' | 'result';

type CurrentQuestion = {
  levelIndex: number;
  wordIndex: number;
  question: LevelTestQuestion;
};

// 誤答時は正解を確認する時間を少し長めに取る
const ADVANCE_DELAY_CORRECT_MS = 700;
const ADVANCE_DELAY_WRONG_MS = 1200;
const LEVEL_FLASH_MS = 1500;

// 「続きから再開」の表示可否。sessionStorageが実体なので
// useSyncExternalStoreで読む(SSR/初回描画ではfalse = ハイドレーション安全)。
const emptySubscribe = () => () => {};
function useHasResumableSession(screen: Screen): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    // screenが変わるたびに再評価される(クイズ開始/終了でセッションが増減するため)
    () => screen === 'start' && loadLevelTestSession() !== null,
    () => false,
  );
}

export default function LevelTestPage() {
  const { user } = useAuth();

  const [screen, setScreen] = useState<Screen>('start');
  const [bank, setBank] = useState<LevelTestBank | null>(null);
  const [bankError, setBankError] = useState(false);
  const hasResumableSession = useHasResumableSession(screen);

  const [state, setState] = useState<LevelTestState>(() => createInitialState());
  const usedKeysRef = useRef<Set<string>>(new Set());
  const [current, setCurrent] = useState<CurrentQuestion | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [levelFlash, setLevelFlash] = useState<LevelTestEvent | null>(null);
  const [resultPayload, setResultPayload] = useState<LevelTestResultPayload | null>(null);
  const [resultCode, setResultCode] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // バンクはスタート画面表示中に先読みする(CDNキャッシュされる静的JSON)
  useEffect(() => {
    let cancelled = false;
    loadLevelTestBank()
      .then((loaded) => {
        if (!cancelled) setBank(loaded);
      })
      .catch(() => {
        if (!cancelled) setBankError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const presentQuestion = useCallback((bankData: LevelTestBank, levelIndex: number, used: Set<string>) => {
    const picked = pickQuestionIndex(bankData, levelIndex, used);
    if (!picked) return null;
    const word = bankData.levels[picked.levelIndex][picked.wordIndex];
    const next: CurrentQuestion = { ...picked, question: buildQuestion(word) };
    setCurrent(next);
    setSelectedIndex(null);
    setIsRevealed(false);
    return next;
  }, []);

  const startQuiz = useCallback((resume: boolean) => {
    if (!bank) return;
    triggerHaptic();

    if (resume) {
      const session = loadLevelTestSession();
      if (session) {
        const restored = session.state;
        const used = new Set(session.usedKeys);
        usedKeysRef.current = used;
        setState(restored);
        setScreen('quiz');
        if (session.currentQuestion) {
          const word = bank.levels[session.currentQuestion.levelIndex]?.[session.currentQuestion.wordIndex];
          if (word) {
            setCurrent({ ...session.currentQuestion, question: buildQuestion(word) });
            setSelectedIndex(null);
            setIsRevealed(false);
            return;
          }
        }
        presentQuestion(bank, restored.levelIndex, used);
        return;
      }
    }

    clearLevelTestSession();
    const initial = createInitialState();
    usedKeysRef.current = new Set();
    setState(initial);
    setResultPayload(null);
    setResultCode(null);
    setScreen('quiz');
    const question = presentQuestion(bank, initial.levelIndex, usedKeysRef.current);
    if (question) {
      saveLevelTestSession({
        state: initial,
        usedKeys: [],
        currentQuestion: { levelIndex: question.levelIndex, wordIndex: question.wordIndex },
      });
    }
  }, [bank, presentQuestion]);

  const finishQuiz = useCallback((finalState: LevelTestState) => {
    const result = buildResult(finalState);
    const code = encodeLevelTestResult(result);
    // 表示は共有ページと同じdecode済みペイロードを使う(表示条件を揃える)
    const payload = decodeLevelTestResult(code);
    clearLevelTestSession();
    setResultCode(code);
    setResultPayload(payload ?? {
      v: 1,
      finalLevel: result.finalLevel,
      maxLevel: result.maxLevel,
      clearedMax: result.clearedMax,
      correctTotal: result.correctTotal,
      askedByLevel: result.askedByLevel,
      correctByLevel: result.correctByLevel,
    });
    setScreen('result');
  }, []);

  const handleSelect = useCallback((optionIndex: number) => {
    if (!bank || !current || isRevealed) return;

    const correct = optionIndex === current.question.correctIndex;
    setSelectedIndex(optionIndex);
    setIsRevealed(true);
    playAnswerFeedbackSound(correct);
    triggerHaptic(correct ? 12 : 30);

    const { state: nextState, events } = answerQuestion(state, correct);
    setState(nextState);

    const specialEvent = events.find((event) => event === 'level-up' || event === 'level-down' || event === 'max-cleared');
    if (specialEvent) {
      setLevelFlash(specialEvent);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setLevelFlash(null), LEVEL_FLASH_MS);
    }

    const used = usedKeysRef.current;
    used.add(usedKeyFor(current.levelIndex, current.wordIndex));

    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      if (isFinished(nextState)) {
        finishQuiz(nextState);
        return;
      }
      const question = presentQuestion(bank, nextState.levelIndex, used);
      saveLevelTestSession({
        state: nextState,
        usedKeys: [...used],
        currentQuestion: question
          ? { levelIndex: question.levelIndex, wordIndex: question.wordIndex }
          : null,
      });
    }, correct ? ADVANCE_DELAY_CORRECT_MS : ADVANCE_DELAY_WRONG_MS);
  }, [bank, current, isRevealed, state, finishQuiz, presentQuestion]);

  if (screen === 'quiz' && current) {
    return (
      <QuizScreen
        state={state}
        current={current}
        selectedIndex={selectedIndex}
        isRevealed={isRevealed}
        levelFlash={levelFlash}
        onSelect={handleSelect}
      />
    );
  }

  if (screen === 'result' && resultPayload && resultCode) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] px-4 py-8" style={{ fontFamily: 'var(--font-body)' }}>
        <div className="mx-auto w-full max-w-[480px]">
          <div className="mb-4 text-center font-display text-[22px] font-extrabold text-[var(--solid-ink)]">
            診断結果
          </div>
          <LevelTestResultCard payload={resultPayload} variant="own" />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            className="mt-5 space-y-3"
          >
            <SolidButton
              variant="accent"
              size="lg"
              iconLeft="ios_share"
              className="w-full"
              onClick={() => setShareOpen(true)}
            >
              結果をシェアする
            </SolidButton>
            <SolidButton size="md" className="w-full" iconLeft="refresh" onClick={() => startQuiz(false)}>
              もう一度測定する
            </SolidButton>
            {user ? (
              <SolidButton size="md" variant="inverse" className="w-full" href="/" iconLeft="home">
                ホームに戻る
              </SolidButton>
            ) : (
              <SolidButton size="md" variant="inverse" className="w-full" href="/signup" iconLeft="rocket_launch">
                MERKENで語彙を増やす(無料登録)
              </SolidButton>
            )}
          </motion.div>
        </div>

        <LevelTestShareSheet
          open={shareOpen}
          code={resultCode}
          payload={resultPayload}
          onClose={() => setShareOpen(false)}
        />
      </div>
    );
  }

  return (
    <StartScreen
      user={Boolean(user)}
      bankReady={bank !== null}
      bankError={bankError}
      hasResumableSession={hasResumableSession}
      onStart={() => startQuiz(false)}
      onResume={() => startQuiz(true)}
      onRetryLoad={() => {
        setBankError(false);
        loadLevelTestBank().then(setBank).catch(() => setBankError(true));
      }}
    />
  );
}

function StartScreen({
  user,
  bankReady,
  bankError,
  hasResumableSession,
  onStart,
  onResume,
  onRetryLoad,
}: {
  user: boolean;
  bankReady: boolean;
  bankError: boolean;
  hasResumableSession: boolean;
  onStart: () => void;
  onResume: () => void;
  onRetryLoad: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-8" style={{ fontFamily: 'var(--font-body)' }}>
      <div className="mx-auto flex w-full max-w-[480px] flex-col items-center">
        <Link href="/" className="mb-6 inline-flex items-center gap-1 self-start text-[13px] font-bold text-[var(--color-muted)]">
          <Icon name="arrow_back" size={16} />
          MERKEN
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-6 text-center shadow-[4px_4px_0_var(--solid-ink)]"
        >
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            VOCABULARY LEVEL TEST
          </div>
          <h1 className="mt-2 font-display text-[28px] font-extrabold leading-tight text-[var(--solid-ink)]">
            あなたの語彙力は
            <br />
            <span className="text-[var(--color-accent)]">英検何級</span>レベル?
          </h1>
          <p className="mt-3 text-[13px] font-bold leading-relaxed text-[var(--color-muted)]">
            正解するほど難しくなる20問で、語彙レベルと推定語彙数を診断します。
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { icon: 'quiz', label: '20問・約3分' },
              { icon: 'military_tech', label: '英検5級〜1級' },
              { icon: 'lock_open', label: '登録不要' },
            ].map((feature) => (
              <div
                key={feature.label}
                className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] px-1 py-3"
              >
                <Icon name={feature.icon} size={20} className="mx-auto text-[var(--color-accent)]" />
                <div className="mt-1 text-[11px] font-extrabold text-[var(--solid-ink)]">{feature.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-2.5">
            {hasResumableSession && (
              <SolidButton size="lg" className="w-full" iconLeft="play_arrow" onClick={onResume} disabled={!bankReady}>
                続きから再開
              </SolidButton>
            )}
            {bankError ? (
              <SolidButton size="lg" variant="inverse" className="w-full" iconLeft="refresh" onClick={onRetryLoad}>
                読み込みに失敗しました。再試行
              </SolidButton>
            ) : (
              <SolidButton
                size="lg"
                variant="accent"
                className="w-full"
                iconRight="arrow_forward"
                onClick={onStart}
                disabled={!bankReady}
              >
                {bankReady ? '診断をはじめる' : '準備中...'}
              </SolidButton>
            )}
          </div>
        </motion.div>

        <p className="mt-4 text-center text-[11px] font-bold text-[var(--color-muted)]">
          2問連続正解でレベルアップ、2問連続不正解でレベルダウン。最後にいたレベルがあなたの語彙レベルです。
        </p>

        {!user && (
          <Link href="/login" className="mt-6 text-[12px] font-bold text-[var(--color-muted)] underline">
            MERKENのアカウントをお持ちの方はログイン
          </Link>
        )}
      </div>
    </div>
  );
}

function QuizScreen({
  state,
  current,
  selectedIndex,
  isRevealed,
  levelFlash,
  onSelect,
}: {
  state: LevelTestState;
  current: CurrentQuestion;
  selectedIndex: number | null;
  isRevealed: boolean;
  levelFlash: LevelTestEvent | null;
  onSelect: (index: number) => void;
}) {
  const levelLabel = EIKEN_LEVEL_LABELS[state.levelIndex];
  const questionNumber = Math.min(state.answeredCount + 1, LEVEL_TEST_QUESTION_COUNT);
  const progressPercent = (state.answeredCount / LEVEL_TEST_QUESTION_COUNT) * 100;

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-[var(--color-background)]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* ヘッダー: 進捗 + 現在レベル */}
      <div className="mx-auto w-full max-w-[560px] px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="やめる" className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]">
            <Icon name="close" size={16} />
          </Link>
          <div className="flex-1">
            <div className="h-3 overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="font-mono text-[12px] font-bold text-[var(--color-muted)]">
            {questionNumber}/{LEVEL_TEST_QUESTION_COUNT}
          </div>
        </div>

        <div className="mt-3 flex justify-center">
          <motion.div
            key={state.levelIndex}
            initial={{ scale: 0.85, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-1.5 font-display text-[13px] font-extrabold text-white"
          >
            <Icon name="military_tech" size={15} />
            Lv.{state.levelIndex + 1} ・ {levelLabel}
          </motion.div>
        </div>
      </div>

      {/* 問題 */}
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="text-center">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            この単語の意味は?
          </div>
          <motion.div
            key={current.question.prompt}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 break-words font-display text-[clamp(30px,9vw,44px)] font-extrabold leading-tight text-[var(--solid-ink)]"
          >
            {current.question.prompt}
          </motion.div>
        </div>

        <div className="mt-8 space-y-2.5">
          {current.question.options.map((option, optionIndex) => {
            const isCorrectOption = optionIndex === current.question.correctIndex;
            const isSelected = optionIndex === selectedIndex;
            let stateClass = 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]';
            if (isRevealed && isCorrectOption) {
              stateClass = 'border-[var(--color-success,#15803d)] bg-[var(--color-success-light,#dcfce7)] text-[var(--solid-ink)]';
            } else if (isRevealed && isSelected) {
              stateClass = 'border-[var(--color-error,#dc2626)] bg-[var(--color-error-light,#fee2e2)] text-[var(--solid-ink)]';
            } else if (isRevealed) {
              stateClass = 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] opacity-60';
            }
            return (
              <button
                key={`${current.question.prompt}-${optionIndex}`}
                type="button"
                disabled={isRevealed}
                onClick={() => onSelect(optionIndex)}
                className={`flex w-full items-center gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--solid-ink)] disabled:active:translate-x-0 disabled:active:translate-y-0 ${stateClass}`}
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-current font-display text-[12px] font-extrabold">
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="min-w-0 flex-1 break-words text-[15px] font-bold">{option}</span>
                {isRevealed && isCorrectOption && <Icon name="check_circle" size={20} className="text-[var(--color-success,#15803d)]" filled />}
                {isRevealed && isSelected && !isCorrectOption && <Icon name="cancel" size={20} className="text-[var(--color-error,#dc2626)]" filled />}
              </button>
            );
          })}
        </div>
      </div>

      {/* レベルアップ/ダウン演出 */}
      <AnimatePresence>
        {levelFlash === 'level-up' && (
          <LevelFlashOverlay
            key="level-up"
            accent="var(--color-accent)"
            icon="trending_up"
            title="LEVEL UP! 🎉"
            subtitle={`${EIKEN_LEVEL_LABELS[state.levelIndex]}に挑戦`}
          />
        )}
        {levelFlash === 'max-cleared' && (
          <LevelFlashOverlay
            key="max-cleared"
            accent="#B8860B"
            icon="crown"
            title="最高レベル到達! 👑"
            subtitle="英検1級を完全制覇"
          />
        )}
        {levelFlash === 'level-down' && (
          <motion.div
            key="level-down"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-1.5 text-[12px] font-extrabold text-[var(--color-muted)]"
          >
            {EIKEN_LEVEL_LABELS[state.levelIndex]}に戻って再挑戦
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LevelFlashOverlay({
  accent,
  icon,
  title,
  subtitle,
}: {
  accent: string;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: 'rgba(26,26,26,0.35)', backdropFilter: 'blur(2px)' }}
    >
      <motion.div
        initial={{ scale: 0.6, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', bounce: 0.55 }}
        className="rounded-[20px] border-[3px] border-[var(--solid-ink)] px-8 py-6 text-center text-white shadow-[6px_6px_0_var(--solid-ink)]"
        style={{ background: accent }}
      >
        <Icon name={icon} size={34} filled className="mx-auto" />
        <div className="mt-1 font-display text-[26px] font-extrabold">{title}</div>
        <div className="mt-1 text-[14px] font-bold opacity-90">{subtitle}</div>
      </motion.div>
    </motion.div>
  );
}
