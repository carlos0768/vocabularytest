'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { getRepository } from '@/lib/db';
import { recordCorrectAnswer, recordWrongAnswer, recordActivity, getGuestUserId } from '@/lib/utils';
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
  VOICE_QUIZ_ATTEMPT_OPTIONS,
} from '@/lib/quiz/voice-quiz-prompt';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

const TIMER_DURATION_MS = 6000;
const TIMER_TICK_MS = 50;
const DEFAULT_COUNT = 10;

type RecordingEncoding = 'WEBM_OPUS' | 'OGG_OPUS';

const CANDIDATE_MIME_TYPES: Array<{ mimeType: string; encoding: RecordingEncoding }> = [
  { mimeType: 'audio/webm;codecs=opus', encoding: 'WEBM_OPUS' },
  { mimeType: 'audio/webm', encoding: 'WEBM_OPUS' },
  { mimeType: 'audio/ogg;codecs=opus', encoding: 'OGG_OPUS' },
];

function pickSupportedRecording(): { mimeType: string; encoding: RecordingEncoding } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
  }
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
  const { subscription, loading: authLoading, user } = useAuth();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const backToProject = useCallback(() => {
    router.replace(returnPath || `/project/${projectId}`);
  }, [router, returnPath, projectId]);

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
  const recordingRef = useRef<{ mimeType: string; encoding: RecordingEncoding } | null>(null);
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
      const recording = pickSupportedRecording();
      if (!recording || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setSetupState('unsupported');
        return;
      }
      recordingRef.current = recording;
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

        setWords(sortWordsByPriority(loaded).slice(0, Math.min(loaded.length, DEFAULT_COUNT)));
      } catch {
        setPrepareError(true);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authLoading, projectId, repository, user, backToProject]);

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

      const { mimeType, encoding } = recordingRef.current;
      const recorder = new MediaRecorder(streamRef.current, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        void (async () => {
          if (questionRunRef.current !== run) return;
          setPhase('grading');
          try {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            const audioBase64 = arrayBufferToBase64(await blob.arrayBuffer());
            const response = await fetch('/api/voice-quiz/recognize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64, encoding }),
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

  const moveToNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= words.length) {
      setIsComplete(true);
      return;
    }
    setCurrentIndex(nextIndex);
    startQuestion(words[nextIndex]);
  };

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
          <button
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="card p-8 w-full max-w-sm text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-[var(--color-accent-light)] rounded-full flex items-center justify-center mx-auto mb-5">
              <Icon name="mic" size={40} className="text-[var(--color-accent-ink)]" />
            </div>

            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-1">音読チャレンジ</h1>
            <p className="text-sm text-[var(--color-muted)] mb-6">
              読み上げられた意味の英単語を、{Math.round(TIMER_DURATION_MS / 1000)}秒以内に声で答えてください。
              <br />
              全{words.length}問
            </p>

            <p className="text-sm font-semibold text-[var(--color-foreground)] mb-2">試行回数</p>
            <div className="flex gap-2 mb-2" role="group" aria-label="試行回数">
              {VOICE_QUIZ_ATTEMPT_OPTIONS.map((option) => {
                const selected = attemptsAllowed === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAttemptsAllowed(option)}
                    className={`flex-1 h-12 rounded-xl border-2 text-base font-bold transition-colors ${
                      selected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]'
                    }`}
                  >
                    {option}回
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--color-muted)] mb-6 min-h-[2.5rem]">
              {attemptsAllowed === 1
                ? '1回でも間違えるとその問題は終了します。'
                : `間違えても「もう一回!」と促されて、最大${attemptsAllowed}回まで挑戦できます。`}
            </p>

            <Button onClick={() => beginSession(attemptsAllowed)} className="w-full" size="lg">
              開始する
            </Button>
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
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 p-4">
          <button
            onClick={backToProject}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="card p-8 w-full max-w-sm text-center animate-fade-in-up">
            <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="emoji_events" size={40} className="text-[var(--color-success)]" />
            </div>

            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">音読チャレンジ完了!</h1>

            <div className="mb-6">
              <p className="text-5xl font-bold text-[var(--color-primary)] mb-1">{percentage}%</p>
              <p className="text-[var(--color-muted)]">
                {results.total}問中 {results.correct}問正解
              </p>
              {results.disqualified > 0 && (
                <p className="text-sm text-[var(--color-error,#ef4444)] mt-1 flex items-center justify-center gap-1">
                  <Icon name="timer_off" size={14} />
                  失格 {results.disqualified}回
                </p>
              )}
            </div>

            <p className="text-[var(--color-foreground)] mb-8">{completionMessage}</p>

            <div className="space-y-3">
              <Button onClick={restartSession} className="w-full" size="lg">
                <Icon name="refresh" size={20} className="mr-2" />
                もう一度
              </Button>
              <Button variant="secondary" onClick={backToProject} className="w-full" size="lg">
                単語一覧に戻る
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 p-4 flex items-center gap-4">
        <button
          onClick={backToProject}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <Icon name="close" size={24} />
        </button>

        <div className="flex-1 progress-bar">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentIndex + (phase === 'answered' ? 1 : 0)) / words.length) * 100}%` }}
          />
        </div>

        <span className="text-xs text-[var(--color-muted)] font-medium tabular-nums">
          {currentIndex + 1}/{words.length}
        </span>
      </header>

      {phase === 'listening' && (
        <div className="px-6 mb-2 flex-shrink-0">
          <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-75 ease-linear"
              style={{
                width: `${(timeLeft / TIMER_DURATION_MS) * 100}%`,
                backgroundColor:
                  timeLeft <= 1000
                    ? 'var(--color-error, #ef4444)'
                    : timeLeft <= 2000
                    ? '#f59e0b'
                    : 'var(--color-primary)',
              }}
            />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        {currentWord && (
          <div className="w-full max-w-sm text-center animate-fade-in-up">
            {phase === 'narrating' && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-[var(--color-accent-light)] flex items-center justify-center">
                  <Icon name="volume_up" size={36} className="text-[var(--color-accent-ink)]" />
                </div>
                <p className="text-lg font-medium text-[var(--color-muted)]">問題を読み上げています...</p>
              </div>
            )}

            {phase === 'listening' && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center animate-pulse shadow-lg">
                  <Icon name="mic" size={36} className="text-white" />
                </div>
                <p className="text-lg font-medium text-[var(--color-foreground)]">英語で答えてください...</p>
                {attemptsAllowed > 1 && (
                  <p className="text-xs font-semibold text-[var(--color-muted)] tabular-nums">
                    {attemptNumber}回目 / 全{attemptsAllowed}回
                  </p>
                )}
              </div>
            )}

            {phase === 'grading' && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                <p className="text-lg font-medium text-[var(--color-muted)]">採点中...</p>
              </div>
            )}

            {phase === 'retrying' && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-[#f59e0b] flex items-center justify-center">
                  <Icon name="refresh" size={40} className="text-white" />
                </div>
                <p className="text-xl font-bold text-[#f59e0b]">{retryMessage}</p>
                {recognizedText && (
                  <p className="text-base text-[var(--color-muted)] line-through">{recognizedText}</p>
                )}
                <p className="text-xs font-semibold text-[var(--color-muted)] tabular-nums">
                  残り{attemptsAllowed - attemptNumber}回
                </p>
              </div>
            )}

            {phase === 'answered' && (
              <div className="flex flex-col items-center gap-4">
                {isCorrect ? (
                  <>
                    <div className="w-20 h-20 rounded-full bg-[var(--color-success)] flex items-center justify-center">
                      <Icon name="check" size={40} className="text-white" />
                    </div>
                    <p className="text-xl font-bold text-[var(--color-success)]">正解!</p>
                    <p className="text-2xl font-bold text-[var(--color-foreground)]">{currentWord.english}</p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-[var(--color-error,#ef4444)] flex items-center justify-center">
                      {isDisqualified ? (
                        <Icon name="timer_off" size={40} className="text-white" />
                      ) : (
                        <Icon name="close" size={40} className="text-white" />
                      )}
                    </div>
                    <p className="text-xl font-bold text-[var(--color-error,#ef4444)]">
                      {isDisqualified ? '失格!' : '不正解'}
                    </p>
                    {recognitionErrored && (
                      <p className="text-xs text-[var(--color-muted)]">(音声認識に失敗しました)</p>
                    )}
                    {recognizedText && !isDisqualified && (
                      <p className="text-base text-[var(--color-muted)] line-through">{recognizedText}</p>
                    )}
                    <div className="mt-2 px-6 py-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                      <p className="text-xs text-[var(--color-muted)] mb-1">正解</p>
                      <p className="text-2xl font-bold text-[var(--color-foreground)]">{currentWord.english}</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {phase === 'answered' && (
        <div className="flex-shrink-0 bg-[var(--color-background)] px-6 pt-3 pb-6 safe-area-bottom">
          <Button onClick={moveToNext} className="w-full max-w-lg mx-auto flex" size="lg">
            次へ
            <Icon name="chevron_right" size={20} className="ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
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
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      <header className="sticky top-0 flex-shrink-0 p-4">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <Icon name="close" size={24} />
        </button>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name={icon} size={32} className="text-orange-500" />
          </div>
          <p className="text-[var(--color-foreground)] font-semibold mb-2">{title}</p>
          <p className="text-sm text-[var(--color-muted)] mb-6">{message}</p>
          <Button onClick={onBack} className="w-full" size="lg">
            戻る
          </Button>
        </div>
      </main>
    </div>
  );
}
