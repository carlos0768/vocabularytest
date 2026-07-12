'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Icon } from '@/components/ui';
import { SolidButton } from '@/components/redesign/SolidPage';
import { LevelTestResultCard } from '@/components/level-test/LevelTestResultCard';
import { LevelTestShareSheet } from '@/components/level-test/LevelTestShareSheet';
import { useAuth } from '@/hooks/use-auth';
import { triggerHaptic } from '@/lib/haptics';
import { loadLevelTestBank, type LevelTestBank } from '@/lib/level-test/bank';
import {
  EIKEN_LEVEL_LABELS,
  LEVEL_TEST_QUESTION_COUNT,
  LEVEL_TEST_QUESTION_TIME_MS,
  answerQuestion,
  buildQuestion,
  buildResult,
  createInitialState,
  isFinished,
  selectNextQuestion,
  usedKeyFor,
  type LevelTestAnswer,
  type LevelTestQuestion,
  type LevelTestState,
} from '@/lib/level-test/engine';
import { encodeLevelTestResult, decodeLevelTestResult, type LevelTestResultPayload } from '@/lib/level-test/result-code';
import {
  clearLevelTestSession,
  loadLevelTestSession,
  saveLevelTestSession,
  type AnsweredWord,
} from '@/lib/level-test/session';

// 語彙レベル診断。未ログインで完全動作し、DBには一切アクセスしない
// (問題バンクは静的JSON、結果はURLに符号化)。

type Screen = 'start' | 'quiz' | 'result';

type CurrentQuestion = {
  levelIndex: number;
  wordIndex: number;
  question: LevelTestQuestion;
};

// 選択状態。数値=選択肢のindex、'unknown'=「わからない」(タップまたは時間切れ)
type Selection = number | 'unknown';

// 正誤やレベル変動は途中で見せず、結果画面まで分からないテンポ重視の構成。
// タップの押下感が伝わる程度の短い間を置いて次の問題へ進む。
const ADVANCE_DELAY_MS = 250;

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
  const answeredWordsRef = useRef<AnsweredWord[]>([]);
  const [current, setCurrent] = useState<CurrentQuestion | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<Selection | null>(null);
  const [answeredWords, setAnsweredWords] = useState<AnsweredWord[]>([]);
  const [resultPayload, setResultPayload] = useState<LevelTestResultPayload | null>(null);
  const [resultCode, setResultCode] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    };
  }, []);

  const presentQuestion = useCallback((bankData: LevelTestBank, quizState: LevelTestState, used: Set<string>) => {
    const picked = selectNextQuestion(bankData, quizState, used);
    if (!picked) return null;
    const word = bankData.levels[picked.levelIndex][picked.wordIndex];
    const next: CurrentQuestion = { ...picked, question: buildQuestion(word) };
    setCurrent(next);
    setSelectedIndex(null);
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
        answeredWordsRef.current = [...session.answeredWords];
        setState(restored);
        setScreen('quiz');
        if (session.currentQuestion) {
          const word = bank.levels[session.currentQuestion.levelIndex]?.[session.currentQuestion.wordIndex];
          if (word) {
            setCurrent({ ...session.currentQuestion, question: buildQuestion(word) });
            setSelectedIndex(null);
            return;
          }
        }
        presentQuestion(bank, restored, used);
        return;
      }
    }

    clearLevelTestSession();
    const initial = createInitialState();
    usedKeysRef.current = new Set();
    answeredWordsRef.current = [];
    setState(initial);
    setAnsweredWords([]);
    setResultPayload(null);
    setResultCode(null);
    setScreen('quiz');
    const question = presentQuestion(bank, initial, usedKeysRef.current);
    if (question) {
      saveLevelTestSession({
        state: initial,
        usedKeys: [],
        answeredWords: [],
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
    setAnsweredWords([...answeredWordsRef.current]);
    setResultCode(code);
    setResultPayload(payload ?? {
      v: 2,
      finalLevel: result.finalLevel,
      maxLevel: result.upperLevel,
      clearedMax: result.clearedMax,
      correctTotal: result.correctTotal,
      askedByLevel: result.askedByLevel,
      correctByLevel: result.correctByLevel,
      ability: result.ability,
      lowerLevel: result.lowerLevel,
      upperLevel: result.upperLevel,
      lowerAbility: result.lowerAbility,
      upperAbility: result.upperAbility,
      confidence: result.confidence,
    });
    setScreen('result');
  }, []);

  const handleSelect = useCallback((selection: Selection) => {
    // selectedIndexが立っている間は次の問題への遷移待ち(二重回答ガード)
    if (!bank || !current || selectedIndex !== null) return;

    const answer: LevelTestAnswer =
      selection === 'unknown'
        ? 'unknown'
        : selection === current.question.correctIndex
          ? 'correct'
          : 'wrong';
    setSelectedIndex(selection);
    triggerHaptic();

    // 正誤や推定の変動は途中では見せない(結果画面まで分からない)
    const nextState = answerQuestion(
      state,
      { levelIndex: current.levelIndex, wordIndex: current.wordIndex },
      bank,
      answer,
    );
    setState(nextState);

    const used = usedKeysRef.current;
    used.add(usedKeyFor(current.levelIndex, current.wordIndex));
    answeredWordsRef.current.push({
      levelIndex: current.levelIndex,
      wordIndex: current.wordIndex,
      correct: answer === 'correct',
      ...(answer === 'unknown' ? { unknown: true } : {}),
    });

    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      if (isFinished(nextState)) {
        finishQuiz(nextState);
        return;
      }
      const question = presentQuestion(bank, nextState, used);
      saveLevelTestSession({
        state: nextState,
        usedKeys: [...used],
        answeredWords: [...answeredWordsRef.current],
        currentQuestion: question
          ? { levelIndex: question.levelIndex, wordIndex: question.wordIndex }
          : null,
      });
    }, ADVANCE_DELAY_MS);
  }, [bank, current, selectedIndex, state, finishQuiz, presentQuestion]);

  if (screen === 'quiz' && current) {
    return (
      <QuizScreen
        state={state}
        current={current}
        selectedIndex={selectedIndex}
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

          {bank && answeredWords.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.15 }}
            >
              <AnsweredWordsPanel bank={bank} answeredWords={answeredWords} />
            </motion.div>
          )}

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
          回答に合わせて出題の難易度が変わる適応式テストです。制限時間は1問10秒(時間切れは「わからない」扱い)。20問すべての回答から、最も確からしい語彙レベルを推定します。
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

// 出題された全単語の○×ふり返りリスト(結果画面のレベル表示の下に出す)。
// 回答履歴は端末内(sessionStorage/メモリ)にのみあるため、共有ページでは表示されない。
function AnsweredWordsPanel({
  bank,
  answeredWords,
}: {
  bank: LevelTestBank;
  answeredWords: AnsweredWord[];
}) {
  const wrongCount = answeredWords.filter((answered) => !answered.correct).length;

  return (
    <div className="mt-4 rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-4 shadow-[3px_3px_0_var(--solid-ink)]">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="font-display text-[16px] font-extrabold text-[var(--solid-ink)]">
          出題された単語をふり返ろう
        </div>
        {wrongCount > 0 && (
          <div className="shrink-0 text-[11px] font-bold text-[var(--color-muted)]">
            間違えた単語 {wrongCount}語
          </div>
        )}
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {answeredWords.map((answered, index) => {
          const word = bank.levels[answered.levelIndex]?.[answered.wordIndex];
          if (!word) return null;
          const gradeLabel = EIKEN_LEVEL_LABELS[answered.levelIndex].replace('英検', '');
          return (
            <div key={`${answered.levelIndex}-${answered.wordIndex}-${index}`} className="flex items-center gap-2.5 py-2.5">
              {answered.correct ? (
                <Icon name="check" size={18} className="shrink-0 text-[var(--color-success,#15803d)]" />
              ) : answered.unknown ? (
                <Icon name="question_mark" size={18} className="shrink-0 text-[var(--color-muted)]" />
              ) : (
                <Icon name="close" size={18} className="shrink-0 text-[var(--color-error,#dc2626)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
                    {word.english}
                  </span>
                  <span className="shrink-0 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--color-muted)]">
                    {gradeLabel}
                  </span>
                </div>
              </div>
              <div className={`max-w-[45%] truncate text-right text-[12px] font-bold ${answered.correct ? 'text-[var(--color-muted)]' : 'text-[var(--color-error,#dc2626)]'}`}>
                {word.japanese}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 1問10秒のカウントダウン。時間切れでonTimeUp(=「わからない」扱い)を呼ぶ。
// 問題ごとにkeyでリマウントしてリセットし、回答済み(locked)の間は凍結する。
function QuestionTimer({ locked, onTimeUp }: { locked: boolean; onTimeUp: () => void }) {
  const [remainingMs, setRemainingMs] = useState(LEVEL_TEST_QUESTION_TIME_MS);
  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (locked) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const left = LEVEL_TEST_QUESTION_TIME_MS - (Date.now() - startedAt);
      if (left <= 0) {
        setRemainingMs(0);
        clearInterval(interval);
        onTimeUpRef.current();
        return;
      }
      setRemainingMs(left);
    }, 100);
    return () => clearInterval(interval);
  }, [locked]);

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const timeRatio = remainingMs / LEVEL_TEST_QUESTION_TIME_MS;
  const timeCritical = !locked && remainingMs <= 3000;

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${timeRatio * 100}%`,
            background: timeCritical ? '#dc2626' : 'var(--color-accent)',
          }}
        />
      </div>
      <div
        className={`w-7 shrink-0 text-right font-mono text-[12px] font-bold ${
          timeCritical ? 'text-[#dc2626]' : 'text-[var(--color-muted)]'
        }`}
      >
        {remainingSeconds}s
      </div>
    </div>
  );
}

function QuizScreen({
  state,
  current,
  selectedIndex,
  onSelect,
}: {
  state: LevelTestState;
  current: CurrentQuestion;
  selectedIndex: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const questionNumber = Math.min(state.answeredCount + 1, LEVEL_TEST_QUESTION_COUNT);
  const progressPercent = (state.answeredCount / LEVEL_TEST_QUESTION_COUNT) * 100;
  const isLocked = selectedIndex !== null;
  const questionKey = `${current.levelIndex}:${current.wordIndex}`;

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col bg-[var(--color-background)]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* ヘッダー: 進捗のみ(正誤・レベル変動は結果画面まで見せない) */}
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

        {/* 残り時間バー(時間切れは「わからない」扱い)。keyで問題ごとにリセット */}
        <QuestionTimer
          key={questionKey}
          locked={isLocked}
          onTimeUp={() => onSelect('unknown')}
        />
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
            const isSelected = optionIndex === selectedIndex;
            return (
              <button
                key={`${current.question.prompt}-${optionIndex}`}
                type="button"
                disabled={isLocked}
                onClick={() => onSelect(optionIndex)}
                className={`flex w-full items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] px-4 py-3.5 text-left shadow-[3px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--solid-ink)] disabled:active:translate-x-0 disabled:active:translate-y-0 ${
                  isSelected
                    ? 'bg-[var(--solid-ink)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--solid-ink)]'
                }`}
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-current font-display text-[12px] font-extrabold">
                  {String.fromCharCode(65 + optionIndex)}
                </span>
                <span className="min-w-0 flex-1 break-words text-[15px] font-bold">{option}</span>
              </button>
            );
          })}

          {/* わからない(時間切れでも自動的にこの扱いになる) */}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => onSelect('unknown')}
            className={`flex w-full items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed px-4 py-3 text-[14px] font-bold transition-all duration-100 active:translate-y-[1px] disabled:active:translate-y-0 ${
              selectedIndex === 'unknown'
                ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
                : 'border-[var(--color-muted)] bg-transparent text-[var(--color-muted)]'
            }`}
          >
            <Icon name="help" size={18} />
            わからない
          </button>
        </div>
      </div>
    </div>
  );
}
