'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { SolidButton } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui/Icon';
import { QuizModeTabs } from '@/components/quiz';
import { getRepository } from '@/lib/db';
import { cn, recordCorrectAnswer, recordWrongAnswer, recordActivity, getGuestUserId } from '@/lib/utils';
import { calculateNextReview, getStatusAfterAnswer, sortWordsByPriority } from '@/lib/spaced-repetition';
import { playAnswerFeedbackSound } from '@/lib/audio/answer-feedback';
import { speakAndWait, speakEnglish, stopSpeaking } from '@/lib/speech';
import {
  buildVoiceQuizPrompt,
  canRetryVoiceQuiz,
  DEFAULT_VOICE_QUIZ_ATTEMPTS,
  normalizeVoiceQuizAttempts,
  pickVoiceQuizRetryPrompt,
  randomVoiceQuizPromptOffset,
  resolveVoiceQuizCount,
  VOICE_QUIZ_ATTEMPT_OPTIONS,
} from '@/lib/quiz/voice-quiz-prompt';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

const TIMER_DURATION_MS = 6000;
const TIMER_TICK_MS = 50;

/**
 * 「次へ」を押さなくても自動で次の問題へ進むまでの待ち時間。
 * finishQuestion が500ms後に正解を読み上げるので、それを聞き終えられる長さにする。
 * 不正解のときは正解を読み取る時間が要るので長めに取る。
 */
const AUTO_ADVANCE_CORRECT_MS = 2200;
const AUTO_ADVANCE_INCORRECT_MS = 3800;

/* --- Merken Design System (Solid) のトークン --- */
/** 面を持つ要素の枠。ハードシャドウは大きさに応じて2種類使い分ける。 */
const SOLID_SURFACE =
  'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]';
const HARD_SHADOW = 'shadow-[3px_4px_0_var(--solid-ink)]';
const HARD_SHADOW_SM = 'shadow-[2px_3px_0_var(--solid-ink)]';
/** 見出しの上に置く小さなラベル。 */
const EYEBROW = 'font-mono text-[10px] font-black uppercase tracking-[0.14em]';

type RecordingEncoding = 'WEBM_OPUS' | 'OGG_OPUS';

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

/** 録音に使う MIME を選ぶ。エンコーディングは録音後の実際の出力から決める。 */
function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

/**
 * MediaRecorder が実際に出力した MIME から、送信するエンコーディングを決める。
 * Safari は `isTypeSupported` が true を返しても mp4/aac で録音することがあり、
 * 要求した側の encoding をそのまま送ると Cloud Speech-to-Text 側で必ず失敗する。
 * 宣言ではなく実際の出力を唯一の判断材料にする。
 */
function encodingFromMimeType(mimeType: string): RecordingEncoding | null {
  const type = mimeType.toLowerCase();
  if (type.includes('webm')) return 'WEBM_OPUS';
  if (type.includes('ogg')) return 'OGG_OPUS';
  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const normalize = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

type Phase = 'narrating' | 'listening' | 'grading' | 'retrying' | 'answered';
type SetupState = 'checking' | 'ready' | 'unsupported' | 'mic-denied';

export default function VoiceQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const returnPath = searchParams.get('from');
  // 通常クイズから引き継いだ出題数。モード選択はURLだけで表現し、保存はしない。
  const requestedCount = resolveVoiceQuizCount(searchParams.get('count'));
  const { subscription, loading: authLoading, user } = useAuth();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const backToProject = useCallback(() => {
    router.replace(returnPath || `/project/${projectId}`);
  }, [router, returnPath, projectId]);

  /** 通常クイズへ戻す。出題数はそのまま引き継ぐ。 */
  const goToNormalQuiz = useCallback(() => {
    const params = new URLSearchParams({ count: String(requestedCount) });
    if (returnPath) params.set('from', returnPath);
    router.replace(`/quiz/${projectId}?${params.toString()}`);
  }, [router, projectId, returnPath, requestedCount]);

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [results, setResults] = useState({ correct: 0, total: 0, disqualified: 0 });
  const [prepareError, setPrepareError] = useState(false);

  const [attemptsAllowed, setAttemptsAllowed] = useState(DEFAULT_VOICE_QUIZ_ATTEMPTS);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [retryMessage, setRetryMessage] = useState('');

  const [setupState, setSetupState] = useState<SetupState>('checking');
  const [phase, setPhase] = useState<Phase>('narrating');
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION_MS);
  const [recognizedText, setRecognizedText] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [recognitionErrored, setRecognitionErrored] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerStartRef = useRef<number | null>(null);
  /** この試行の判定が済んだか。1問の中で複数回試行するので試行ごとにリセットする。 */
  const attemptSettledRef = useRef(false);
  const attemptRef = useRef(1);
  const attemptsAllowedRef = useRef(DEFAULT_VOICE_QUIZ_ATTEMPTS);
  const questionRunRef = useRef(0);
  /**
   * いま出題中の単語。`setCurrentIndex` の反映は次のレンダーまで待たされるので、
   * 「次へ」の直後に startQuestion を呼ぶとレンダー由来の値はまだ1問前を指す。
   * 出題〜採点の一連の処理はこの ref を唯一の参照元にする。
   */
  const activeWordRef = useRef<Word | null>(null);
  // セッションごとに開始テンプレートをずらし、毎回同じ言い回しで始まらないようにする。
  const promptOffsetRef = useRef(randomVoiceQuizPromptOffset());
  // startListening と handleAttemptResult は相互に呼び合うので ref 経由で解決する。
  const startListeningRef = useRef<(run: number) => void>(() => {});

  const currentWord = words[currentIndex] ?? null;

  // マイク権限 + MediaRecorder対応を一度だけ確認する。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mimeType = pickSupportedMimeType();
      if (!mimeType || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setSetupState('unsupported');
        return;
      }
      recordingRef.current = mimeType;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setSetupState('ready');
      } catch {
        if (!cancelled) setSetupState('mic-denied');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // 単語の読み込み。出題文はテンプレートから組み立てるので事前準備は不要。
  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      try {
        const ownerUserId = user ? user.id : getGuestUserId();
        const project = await repository.getProject(projectId);
        if (!project || project.userId !== ownerUserId) {
          backToProject();
          return;
        }

        let loaded = await repository.getWords(projectId);
        const unmastered = loaded.filter((w) => w.status !== 'mastered');
        if (unmastered.length > 0) {
          loaded = unmastered;
        }

        if (loaded.length === 0) {
          backToProject();
          return;
        }

        setWords(sortWordsByPriority(loaded).slice(0, Math.min(loaded.length, requestedCount)));
      } catch {
        setPrepareError(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authLoading, projectId, repository, user, backToProject, requestedCount]);

  /** 1問を確定させる。以降この問題では再挑戦しない。 */
  const finishQuestion = useCallback(
    async (transcript: string, correct: boolean, apiErrored: boolean) => {
      const word = activeWordRef.current;
      if (!word) return;
      timerStartRef.current = null;

      const disqualified = !transcript;

      playAnswerFeedbackSound(correct);
      setRecognizedText(transcript);
      setIsCorrect(correct);
      setIsDisqualified(disqualified);
      setRecognitionErrored(apiErrored);
      setPhase('answered');

      setResults((prev) => ({
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        disqualified: prev.disqualified + (disqualified ? 1 : 0),
      }));

      if (correct) {
        recordCorrectAnswer(false);
      } else {
        recordWrongAnswer(word.id, word.english, word.japanese, projectId, word.distractors);
      }
      recordActivity();

      // 正解の発音を聞かせる。
      window.setTimeout(() => speakEnglish(word.english), 500);

      try {
        const newStatus = getStatusAfterAnswer(word.status, correct);
        const srUpdate = calculateNextReview(correct, word);
        const updates = { status: newStatus, ...srUpdate };
        await repository.updateWord(word.id, updates);
        setWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, ...updates } : w)));
      } catch {}
    },
    [projectId, repository],
  );

  /** 1回の試行の結果を受けて、再挑戦させるか問題を確定するかを決める。 */
  const handleAttemptResult = useCallback(
    async (transcript: string, apiErrored: boolean, run: number) => {
      if (attemptSettledRef.current) return;
      attemptSettledRef.current = true;
      const word = activeWordRef.current;
      if (!word || questionRunRef.current !== run) return;

      const correct = !!transcript && normalize(transcript) === normalize(word.english);

      // 音声認識自体が失敗した場合は、ユーザーの責任ではないので再挑戦させずに確定する。
      if (correct || apiErrored || !canRetryVoiceQuiz(attemptRef.current, attemptsAllowedRef.current)) {
        await finishQuestion(transcript, correct, apiErrored);
        return;
      }

      // まだ試行回数が残っているので「もう一回!」と促してから聞き直す。
      timerStartRef.current = null;
      playAnswerFeedbackSound(false);
      const retryPrompt = pickVoiceQuizRetryPrompt(attemptRef.current - 1);
      setRecognizedText(transcript);
      setRetryMessage(retryPrompt);
      setPhase('retrying');

      await speakAndWait(retryPrompt, 'ja');
      if (questionRunRef.current !== run) return;

      attemptRef.current += 1;
      setAttemptNumber(attemptRef.current);
      startListeningRef.current(run);
    },
    [finishQuestion],
  );

  /** 録音+カウントダウンを開始する。1問の中で試行のたびに呼ばれる。 */
  const startListening = useCallback(
    (run: number) => {
      if (!streamRef.current || !recordingRef.current) return;

      attemptSettledRef.current = false;
      chunksRef.current = [];
      setRecognizedText('');
      setRetryMessage('');
      setTimeLeft(TIMER_DURATION_MS);
      setPhase('listening');
      timerStartRef.current = Date.now();

      const mimeType = recordingRef.current;
      const recorder = new MediaRecorder(streamRef.current, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        void (async () => {
          if (questionRunRef.current !== run) return;
          setPhase('grading');
          try {
            // 要求した mimeType ではなく、MediaRecorder が実際に採用した型で判断する。
            const recordedMimeType = recorder.mimeType || mimeType;
            const recordedEncoding = encodingFromMimeType(recordedMimeType);
            const blob = new Blob(chunksRef.current, { type: recordedMimeType });

            if (!recordedEncoding || blob.size === 0) {
              console.error(
                `Voice quiz recording unusable (mimeType=${recordedMimeType}, bytes=${blob.size})`,
              );
              await handleAttemptResult('', true, run);
              return;
            }

            const audioBase64 = arrayBufferToBase64(await blob.arrayBuffer());
            const response = await fetch('/api/voice-quiz/recognize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64, encoding: recordedEncoding }),
            });
            const data = await response.json();
            if (questionRunRef.current !== run) return;
            if (!response.ok || !data.success) {
              await handleAttemptResult('', true, run);
              return;
            }
            await handleAttemptResult(typeof data.transcript === 'string' ? data.transcript : '', false, run);
          } catch {
            if (questionRunRef.current === run) await handleAttemptResult('', true, run);
          }
        })();
      };

      recorderRef.current = recorder;
      recorder.start();
    },
    [handleAttemptResult],
  );

  startListeningRef.current = startListening;

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const startQuestion = useCallback((word: Word) => {
    if (!word || !streamRef.current || !recordingRef.current) return;

    activeWordRef.current = word;
    const run = questionRunRef.current + 1;
    questionRunRef.current = run;
    attemptRef.current = 1;
    attemptSettledRef.current = false;
    setAttemptNumber(1);
    setRetryMessage('');
    setRecognizedText('');
    setIsCorrect(false);
    setIsDisqualified(false);
    setRecognitionErrored(false);
    setTimeLeft(TIMER_DURATION_MS);
    setPhase('narrating');

    void (async () => {
      // 出題文は日本語訳だけから組み立てるので、英単語のスペルは読み上げられない。
      await speakAndWait(buildVoiceQuizPrompt(word.japanese, promptOffsetRef.current + run), 'ja');
      if (questionRunRef.current !== run) return;
      startListeningRef.current(run);
    })();
  }, []);

  // カウントダウン(listening中のみ)。時間切れで録音を止め、採点へ進む。
  useEffect(() => {
    if (phase !== 'listening') return;

    const tick = () => {
      if (!timerStartRef.current || attemptSettledRef.current) return;
      const remaining = Math.max(0, TIMER_DURATION_MS - (Date.now() - timerStartRef.current));
      setTimeLeft(remaining);
      if (remaining <= 0) stopRecording();
    };

    const intervalId = setInterval(tick, TIMER_TICK_MS);
    return () => clearInterval(intervalId);
  }, [phase, stopRecording]);

  const moveToNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= words.length) {
      setIsComplete(true);
      return;
    }
    setCurrentIndex(nextIndex);
    startQuestion(words[nextIndex]);
  }, [currentIndex, words, startQuestion]);

  // finishQuestion が words を書き換えると moveToNext の同一性が変わる。
  // タイマーを張り直さないよう、効果の依存からは外して ref 経由で呼ぶ。
  const moveToNextRef = useRef(moveToNext);
  moveToNextRef.current = moveToNext;

  /**
   * 解答後は「次へ」を押さなくても自動で次の問題へ進む。
   * ボタンは早送り用に残してあるので、待ちたくないときは従来どおり押せる。
   */
  useEffect(() => {
    if (phase !== 'answered') return;
    const delay = isCorrect ? AUTO_ADVANCE_CORRECT_MS : AUTO_ADVANCE_INCORRECT_MS;
    const timeoutId = window.setTimeout(() => moveToNextRef.current(), delay);
    return () => window.clearTimeout(timeoutId);
  }, [phase, isCorrect]);

  const beginSession = (attempts: number) => {
    if (words.length === 0) return;
    attemptsAllowedRef.current = normalizeVoiceQuizAttempts(attempts);
    setAttemptsAllowed(attemptsAllowedRef.current);
    setCurrentIndex(0);
    setHasStarted(true);
    startQuestion(words[0]);
  };

  const restartSession = () => {
    setCurrentIndex(0);
    setResults({ correct: 0, total: 0, disqualified: 0 });
    setIsComplete(false);
    questionRunRef.current = 0;
    setHasStarted(false);
  };

  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop(); } catch {}
      stopSpeaking();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --- Render ---

  if (loading || setupState === 'checking') {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">
            {setupState === 'checking' ? 'マイクを確認中...' : '準備中...'}
          </p>
        </div>
      </div>
    );
  }

  if (prepareError) {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="error"
        title="問題の準備に失敗しました"
        message="通信状況を確認して、もう一度お試しください。"
      />
    );
  }

  if (setupState === 'unsupported') {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="mic_off"
        title="このブラウザでは音読チャレンジがサポートされていません"
        message="Google Chrome または Microsoft Edge で開き直してください。"
      />
    );
  }

  if (setupState === 'mic-denied') {
    return (
      <NoticeScreen
        onBack={backToProject}
        icon="mic_off"
        title="マイクへのアクセスが許可されていません"
        message="ブラウザの設定でマイクへのアクセスを許可してから、もう一度お試しください。"
      />
    );
  }

  // 開始画面。ここで試行回数を選ぶ。
  // 「開始」タップがユーザー操作になるので、多くのブラウザが要求する
  // 音声合成の発火条件(ユーザージェスチャー)も同時に満たせる。
  if (!hasStarted) {
    return (
      <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 flex-shrink-0 p-4">
          <CloseButton onClick={backToProject} />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
          <div className="w-full max-w-sm mb-5">
            <QuizModeTabs active="voice" onSelect={goToNormalQuiz} />
          </div>

          <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-7 text-center animate-fade-in-up')}>
            <div
              className={cn(
                'mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent-light)]',
                HARD_SHADOW_SM,
              )}
            >
              <Icon name="mic" size={38} className="text-[var(--color-accent-ink)]" />
            </div>

            <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Voice Challenge</p>
            <h1 className="mt-1 font-display text-[1.9rem] font-black leading-[1.05] text-[var(--solid-ink)]">
              音読チャレンジ
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
              読み上げられた意味の英単語を、
              <br />
              {Math.round(TIMER_DURATION_MS / 1000)}秒以内に声で答えてください。
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <StatChip icon="list" label="出題数" value={`${words.length}問`} />
              <StatChip icon="timer" label="制限時間" value={`${Math.round(TIMER_DURATION_MS / 1000)}秒`} />
            </div>

            <p className={cn(EYEBROW, 'mt-6 mb-2 text-left text-[var(--color-muted)]')}>試行回数</p>
            <div className="flex gap-2" role="group" aria-label="試行回数">
              {VOICE_QUIZ_ATTEMPT_OPTIONS.map((option) => {
                const selected = attemptsAllowed === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAttemptsAllowed(option)}
                    className={cn(
                      'flex-1 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] py-3 font-display text-base font-black transition-all duration-100 active:translate-x-px active:translate-y-px',
                      selected
                        ? cn('bg-[var(--solid-ink)] text-[var(--color-surface)]', HARD_SHADOW_SM)
                        : 'bg-[var(--color-surface)] text-[var(--solid-ink)]',
                    )}
                  >
                    {option}回
                  </button>
                );
              })}
            </div>
            <p className="mt-3 mb-6 min-h-[2.5rem] text-xs leading-5 text-[var(--color-muted)]">
              {attemptsAllowed === 1
                ? '1回でも間違えるとその問題は終了します。'
                : `間違えても「もう一回!」と促されて、最大${attemptsAllowed}回まで挑戦できます。`}
            </p>

            <SolidButton
              variant="accent"
              size="lg"
              iconRight="arrow_forward"
              onClick={() => beginSession(attemptsAllowed)}
              className={cn('w-full', HARD_SHADOW)}
            >
              開始する
            </SolidButton>
          </div>
        </main>
      </div>
    );
  }

  if (isComplete) {
    const percentage = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;
    const completionMessage = percentage === 100
      ? 'パーフェクト! 素晴らしい!'
      : percentage >= 80
      ? 'よくできました!'
      : percentage >= 60
      ? 'もう少し! 復習しましょう'
      : '繰り返し練習しましょう!';

    return (
      <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 flex-shrink-0 p-4">
          <CloseButton onClick={backToProject} />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
          <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'w-full max-w-sm p-7 text-center animate-fade-in-up')}>
            <div
              className={cn(
                'mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border-2 border-[var(--solid-ink)] bg-[var(--color-success-light)]',
                HARD_SHADOW_SM,
              )}
            >
              <Icon name="emoji_events" size={38} className="text-[var(--color-success)]" />
            </div>

            <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Result</p>
            <h1 className="mt-1 font-display text-[1.6rem] font-black leading-tight text-[var(--solid-ink)]">
              音読チャレンジ完了!
            </h1>

            <p className="mt-5 font-mono text-[3.75rem] font-black leading-none tabular-nums text-[var(--solid-ink)]">
              {percentage}
              <span className="text-2xl">%</span>
            </p>

            {/* 正答率バー。数字だけより結果の重みが伝わる。 */}
            <div className="mx-auto mt-4 h-3 w-full overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
              <div
                className="h-full bg-[var(--color-accent)] transition-[width] duration-700 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatChip icon="check" label="正解" value={`${results.correct}/${results.total}`} />
              <StatChip
                icon={results.disqualified > 0 ? 'timer_off' : 'timer'}
                label="失格"
                value={`${results.disqualified}回`}
                tone={results.disqualified > 0 ? 'error' : 'default'}
              />
            </div>

            <p className="mt-6 font-display text-base font-black text-[var(--solid-ink)]">{completionMessage}</p>

            <div className="mt-7 space-y-3">
              <SolidButton
                variant="accent"
                size="lg"
                iconLeft="refresh"
                onClick={restartSession}
                className={cn('w-full', HARD_SHADOW)}
              >
                もう一度
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

  // 残り時間の色。1秒を切ったら赤、2秒を切ったら警告色。
  const timerTone =
    timeLeft <= 1000
      ? 'var(--color-error, #ef4444)'
      : timeLeft <= 2000
      ? 'var(--color-warning)'
      : 'var(--color-accent)';
  const answeredCount = currentIndex + (phase === 'answered' ? 1 : 0);
  const autoAdvanceMs = isCorrect ? AUTO_ADVANCE_CORRECT_MS : AUTO_ADVANCE_INCORRECT_MS;
  const isLastQuestion = currentIndex + 1 >= words.length;

  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 flex items-center gap-3 p-4">
        <CloseButton onClick={backToProject} />

        <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
          <div
            className="h-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${(answeredCount / words.length) * 100}%` }}
          />
        </div>

        <span className="font-mono text-xs font-black tabular-nums text-[var(--solid-ink)]">
          {currentIndex + 1}/{words.length}
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 overflow-y-auto">
        {currentWord && (
          <div className="w-full max-w-sm animate-fade-in-up">
            {/* 出題中の意味。英単語は伏せたまま、何を聞かれているかを目でも追えるようにする。 */}
            {phase !== 'answered' && (
              <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'mb-7 px-5 py-4 text-center')}>
                <p className={cn(EYEBROW, 'text-[var(--color-accent)]')}>Question</p>
                <p className="mt-1.5 font-display text-2xl font-black leading-snug text-[var(--solid-ink)]">
                  {currentWord.japanese}
                </p>
              </div>
            )}

            <div className="flex flex-col items-center gap-4 text-center">
              {phase === 'narrating' && (
                <>
                  <div
                    className={cn(
                      'flex h-40 w-40 flex-col items-center justify-center gap-3 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent-light)]',
                      HARD_SHADOW,
                    )}
                  >
                    <SoundWave />
                    <span className={cn(EYEBROW, 'text-[var(--color-accent-ink)]')}>Speaking</span>
                  </div>
                  <p className="font-display text-base font-black text-[var(--solid-ink)]">
                    問題を読み上げています...
                  </p>
                </>
              )}

              {phase === 'listening' && (
                <>
                  {/* アイコンではなく残り秒数そのものを大きく出す。 */}
                  <div className="relative h-40 w-40">
                    <CountdownRing progress={timeLeft / TIMER_DURATION_MS} tone={timerTone} />
                    <div
                      className={cn(
                        'absolute inset-[20px] flex flex-col items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]',
                        HARD_SHADOW_SM,
                      )}
                    >
                      <span
                        className="font-mono text-[2.75rem] font-black leading-none tabular-nums"
                        style={{ color: timerTone }}
                      >
                        {Math.ceil(timeLeft / 1000)}
                      </span>
                      <span className={cn(EYEBROW, 'mt-1.5 text-[var(--color-muted)]')}>秒</span>
                    </div>
                  </div>

                  {/* 録音中であることを言葉でも示す。 */}
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-error,#ef4444)] animate-pulse" />
                    <p className="font-display text-base font-black text-[var(--solid-ink)]">
                      録音中 — 英語で答えてください
                    </p>
                  </div>

                  {attemptsAllowed > 1 && <AttemptPill current={attemptNumber} total={attemptsAllowed} />}

                  {/* 6秒待たずに送れるようにする。何をすればいいかも明示される。 */}
                  <SolidButton
                    variant="accent"
                    size="lg"
                    iconLeft="check"
                    onClick={stopRecording}
                    className={cn('mt-1 w-full', HARD_SHADOW)}
                  >
                    話し終わった
                  </SolidButton>
                </>
              )}

              {phase === 'grading' && (
                <>
                  <div
                    className={cn(
                      'flex h-36 w-36 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]',
                      HARD_SHADOW,
                    )}
                  >
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                  </div>
                  <p className="font-display text-base font-black text-[var(--color-muted)]">採点中...</p>
                </>
              )}

              {phase === 'retrying' && (
                <>
                  <PhaseOrb
                    icon="refresh"
                    className="bg-[var(--color-warning-light)]"
                    iconClassName="text-[var(--color-warning)]"
                  />
                  <p className="font-display text-xl font-black text-[var(--color-warning)]">{retryMessage}</p>
                  {recognizedText && <MisheardText text={recognizedText} />}
                  <AttemptPill current={attemptNumber} total={attemptsAllowed} remaining />
                </>
              )}

              {phase === 'answered' && (
                <>
                  <PhaseOrb
                    icon={isCorrect ? 'check' : isDisqualified ? 'timer_off' : 'close'}
                    className={isCorrect ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error,#ef4444)]'}
                    iconClassName="text-white"
                  />
                  <p
                    className={cn(
                      'font-display text-xl font-black',
                      isCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error,#ef4444)]',
                    )}
                  >
                    {isCorrect ? '正解!' : isDisqualified ? '失格!' : '不正解'}
                  </p>
                  {recognitionErrored && (
                    <p className="text-xs text-[var(--color-muted)]">音声認識に失敗しました</p>
                  )}
                  {recognizedText && !isCorrect && !isDisqualified && <MisheardText text={recognizedText} />}

                  <div className={cn(SOLID_SURFACE, HARD_SHADOW, 'mt-1 w-full px-5 py-4')}>
                    <p className={cn(EYEBROW, 'text-[var(--color-muted)]')}>Answer</p>
                    <p className="mt-1 font-display text-[1.75rem] font-black leading-tight text-[var(--solid-ink)]">
                      {currentWord.english}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{currentWord.japanese}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {phase === 'answered' && (
        <div className="flex-shrink-0 bg-[var(--color-background)] px-6 pt-3 pb-6 safe-area-bottom">
          <div className="mx-auto w-full max-w-lg">
            {/* 自動で次へ進むまでの残り時間。待ちたくなければボタンを押せばすぐ進む。 */}
            <p className={cn(EYEBROW, 'mb-1.5 text-center text-[var(--color-muted)]')}>
              {isLastQuestion ? 'まもなく結果へ' : 'まもなく次の問題へ'}
            </p>
            <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                key={currentIndex}
                className="voice-quiz-drain h-full rounded-full bg-[var(--solid-ink)]"
                style={{ '--voice-quiz-drain': `${autoAdvanceMs}ms` } as CSSProperties}
              />
            </div>
            <SolidButton
              variant="inverse"
              size="lg"
              iconRight="chevron_right"
              onClick={moveToNext}
              className={cn('w-full', HARD_SHADOW)}
            >
              {isLastQuestion ? '結果を見る' : '次へ進む'}
            </SolidButton>
          </div>
        </div>
      )}
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

function StatChip({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: string;
  label: string;
  value: string;
  tone?: 'default' | 'error';
}) {
  const errorTone = tone === 'error';
  return (
    <div className="rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] px-3 py-2.5 text-left">
      <div className="flex items-center gap-1.5">
        <Icon
          name={icon}
          size={14}
          className={errorTone ? 'text-[var(--color-error,#ef4444)]' : 'text-[var(--color-muted)]'}
        />
        <span className={cn(EYEBROW, 'text-[var(--color-muted)]')}>{label}</span>
      </div>
      <p
        className={cn(
          'mt-0.5 font-mono text-base font-black tabular-nums',
          errorTone ? 'text-[var(--color-error,#ef4444)]' : 'text-[var(--solid-ink)]',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** 各フェーズの中央に置く大きな円。 */
function PhaseOrb({
  icon,
  className,
  iconClassName,
}: {
  icon: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-36 w-36 items-center justify-center rounded-full border-2 border-[var(--solid-ink)]',
        HARD_SHADOW,
        className,
      )}
    >
      <Icon name={icon} size={52} className={iconClassName} />
    </div>
  );
}

/** 残り時間を示すリング。中央のマイクを囲む。 */
function CountdownRing({ progress, tone }: { progress: number; tone: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="8" />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke={tone}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
      <circle cx="60" cy="60" r={radius + 4} fill="none" stroke="var(--solid-ink)" strokeWidth="2" />
    </svg>
  );
}

/** 読み上げ中のイコライザ。 */
function SoundWave() {
  return (
    <div className="flex h-6 items-end gap-1.5" aria-hidden="true">
      {[0, 140, 280, 420, 560].map((delay) => (
        <span
          key={delay}
          className="voice-quiz-wave block h-6 w-1.5 rounded-full bg-[var(--color-accent)]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

/** 何回目の試行かを示すピル。 */
function AttemptPill({
  current,
  total,
  remaining,
}: {
  current: number;
  total: number;
  remaining?: boolean;
}) {
  return (
    <span className="inline-flex items-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-1 font-mono text-[11px] font-black tabular-nums text-[var(--solid-ink)]">
      {remaining ? `残り${total - current}回` : `${current} / ${total}`}
    </span>
  );
}

/** 認識された(=間違えた)発話。 */
function MisheardText({ text }: { text: string }) {
  return <p className="font-mono text-sm text-[var(--color-muted)] line-through">{text}</p>;
}

function NoticeScreen({
  onBack,
  icon,
  title,
  message,
}: {
  onBack: () => void;
  icon: string;
  title: string;
  message: string;
}) {
  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 p-4">
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
          <SolidButton size="lg" onClick={onBack} className={cn('w-full', HARD_SHADOW_SM)}>
            戻る
          </SolidButton>
        </div>
      </main>
    </div>
  );
}
