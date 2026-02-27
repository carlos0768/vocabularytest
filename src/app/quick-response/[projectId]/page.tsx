'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { getRepository } from '@/lib/db';
import { recordCorrectAnswer, recordWrongAnswer, recordActivity, getGuestUserId } from '@/lib/utils';
import { calculateNextReview, sortWordsByPriority } from '@/lib/spaced-repetition';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

const TIMER_DURATION_MS = 3000;
const TIMER_TICK_MS = 50;
const DEFAULT_COUNT = 10;

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Brave等のブラウザではWeb Speech APIオブジェクトは存在するが、
 * Googleの音声認識サーバーへの接続がブロックされるため実際には動作しない。
 * 短い認識テストを実行して、本当に使えるか確認する。
 */
function testSpeechRecognition(): Promise<boolean> {
  return new Promise((resolve) => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) {
      resolve(false);
      return;
    }

    let resolved = false;
    const done = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const timeout = setTimeout(() => {
      try { recognition.abort(); } catch {}
      done(true);
    }, 2000);

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      clearTimeout(timeout);
      try { recognition.abort(); } catch {}
      if (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'not-allowed') {
        done(false);
      } else {
        done(true);
      }
    };

    recognition.onend = () => {
      clearTimeout(timeout);
      done(true);
    };

    try {
      recognition.start();
    } catch {
      clearTimeout(timeout);
      done(false);
    }
  });
}

export default function QuickResponsePage() {
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
    router.push(returnPath || `/project/${projectId}`);
  }, [router, returnPath, projectId]);

  // Core state
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [results, setResults] = useState({ correct: 0, total: 0, timeouts: 0 });

  // Per-question state
  const [phase, setPhase] = useState<'listening' | 'answered'>('listening');
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION_MS);
  const [recognizedText, setRecognizedText] = useState('');
  const [isCorrect, setIsCorrect] = useState(false);
  const [isTimedOut, setIsTimedOut] = useState(false);

  // Speech support: null = testing, true = supported, false = not supported
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null);

  const timerStartRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const answeredRef = useRef(false);
  const bestTranscriptRef = useRef('');
  const timedOutRef = useRef(false);
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentWord = words[currentIndex] ?? null;

  // Test speech recognition on mount
  useEffect(() => {
    let cancelled = false;
    testSpeechRecognition().then((supported) => {
      if (!cancelled) setSpeechSupported(supported);
    });
    return () => { cancelled = true; };
  }, []);

  // Load words
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

        const sorted = sortWordsByPriority(loaded);
        setWords(sorted.slice(0, Math.min(sorted.length, DEFAULT_COUNT)));
      } catch {
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authLoading, projectId, repository, user, backToProject]);

  // Normalize for comparison
  const normalize = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

  const currentWordRef = useRef(currentWord);
  currentWordRef.current = currentWord;

  // Handle answer
  const handleAnswer = useCallback(
    async (transcript: string, timedOut: boolean) => {
      if (answeredRef.current) return;
      const word = currentWordRef.current;
      if (!word) return;
      answeredRef.current = true;

      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      timerStartRef.current = null;
      if (graceTimeoutRef.current) {
        clearTimeout(graceTimeoutRef.current);
        graceTimeoutRef.current = null;
      }

      // transcript自体と、bestTranscriptRef（直近のinterim/final含む）の両方で判定
      const bestAvailable = transcript || bestTranscriptRef.current;
      const normalizedAnswer = normalize(bestAvailable);
      const normalizedExpected = normalize(word.english);
      const correct = !!bestAvailable && normalizedAnswer === normalizedExpected;

      setRecognizedText(bestAvailable);
      setIsCorrect(correct);
      setIsTimedOut(timedOut && !bestAvailable);
      setPhase('answered');

      setResults((prev) => ({
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        timeouts: prev.timeouts + (timedOut && !bestAvailable ? 1 : 0),
      }));

      if (correct) {
        recordCorrectAnswer(false);
      } else {
        recordWrongAnswer(word.id, word.english, word.japanese, projectId, word.distractors);
      }
      recordActivity();

      try {
        const srUpdate = calculateNextReview(correct, word);
        await repository.updateWord(word.id, srUpdate);
        setWords((prev) =>
          prev.map((w) => (w.id === word.id ? { ...w, ...srUpdate } : w))
        );
      } catch {}
    },
    [projectId, repository]
  );

  // Start recognition + timer
  const startQuestion = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    answeredRef.current = false;
    bestTranscriptRef.current = '';
    timedOutRef.current = false;
    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = null;
    }
    setPhase('listening');
    setTimeLeft(TIMER_DURATION_MS);
    setRecognizedText('');
    setIsCorrect(false);
    setIsTimedOut(false);

    timerStartRef.current = Date.now();

    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return;

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const display = finalTranscript || interimTranscript;
        if (display) {
          bestTranscriptRef.current = display;
          setRecognizedText(display);
        }

        if (finalTranscript) {
          handleAnswer(finalTranscript, false);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
      };

      recognition.onend = () => {
        if (!answeredRef.current) {
          // 認識が終了したがfinalTranscriptが来なかった場合、
          // bestTranscriptRef（interim結果）で判定する
          if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
          const isTimeout = !timerStartRef.current || (Date.now() - timerStartRef.current) >= TIMER_DURATION_MS;
          graceTimeoutRef.current = setTimeout(() => {
            if (!answeredRef.current) {
              handleAnswer(bestTranscriptRef.current, isTimeout);
            }
          }, 150);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
    }
  }, [handleAnswer]);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'listening' || words.length === 0) return;

    const tick = () => {
      if (!timerStartRef.current || answeredRef.current) return;
      const elapsed = Date.now() - timerStartRef.current;
      const remaining = Math.max(0, TIMER_DURATION_MS - elapsed);
      setTimeLeft(remaining);

      if (remaining <= 0 && !timedOutRef.current) {
        timedOutRef.current = true;
        // finalTranscriptがまだ届いていない可能性があるため、少し待ってから判定する
        graceTimeoutRef.current = setTimeout(() => {
          if (!answeredRef.current) {
            handleAnswer(bestTranscriptRef.current, true);
          }
        }, 300);
      }
    };

    const intervalId = setInterval(tick, TIMER_TICK_MS);
    return () => clearInterval(intervalId);
  }, [phase, words.length, handleAnswer]);

  // Start first question when words loaded and speech test passed
  useEffect(() => {
    if (!loading && words.length > 0 && speechSupported === true && phase === 'listening' && currentIndex === 0 && !answeredRef.current) {
      startQuestion();
    }
  }, [loading, words.length, speechSupported, phase, currentIndex, startQuestion]);

  const moveToNext = () => {
    if (currentIndex + 1 >= words.length) {
      setIsComplete(true);
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
    } else {
      setCurrentIndex((prev) => prev + 1);
      startQuestion();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch {}
      recognitionRef.current = null;
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    };
  }, []);

  // --- Render ---

  if (loading || speechSupported === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">
            {speechSupported === null ? '音声認識を確認中...' : '準備中...'}
          </p>
        </div>
      </div>
    );
  }

  if (!speechSupported) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
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
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="mic_off" size={32} className="text-orange-500" />
            </div>
            <p className="text-[var(--color-foreground)] font-semibold mb-2">このブラウザでは音声認識がサポートされていません</p>
            <p className="text-sm text-[var(--color-muted)] mb-6">
              Google Chrome または Microsoft Edge で開き直してください。
              <br />
              Brave などの一部ブラウザでは音声認識が動作しません。
            </p>
            <Button onClick={backToProject} className="w-full" size="lg">
              戻る
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (isComplete) {
    const percentage = results.total > 0 ? Math.round((results.correct / results.total) * 100) : 0;

    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
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

            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
              即答チャレンジ完了!
            </h1>

            <div className="mb-6">
              <p className="text-5xl font-bold text-[var(--color-primary)] mb-1">
                {percentage}%
              </p>
              <p className="text-[var(--color-muted)]">
                {results.total}問中 {results.correct}問正解
              </p>
              {results.timeouts > 0 && (
                <p className="text-sm text-[var(--color-error,#ef4444)] mt-1 flex items-center justify-center gap-1">
                  <Icon name="timer_off" size={14} />
                  時間切れ {results.timeouts}回
                </p>
              )}
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
              <Button
                onClick={() => {
                  setCurrentIndex(0);
                  setResults({ correct: 0, total: 0, timeouts: 0 });
                  setIsComplete(false);
                  startQuestion();
                }}
                className="w-full"
                size="lg"
              >
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
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Main quiz screen
  return (
    <div className="h-dvh flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      {/* Header */}
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
            style={{
              width: `${((currentIndex + (phase === 'answered' ? 1 : 0)) / words.length) * 100}%`,
            }}
          />
        </div>

        <span className="text-xs text-[var(--color-muted)] font-medium tabular-nums">
          {currentIndex + 1}/{words.length}
        </span>
      </header>

      {/* Timer bar */}
      {phase === 'listening' && (
        <div className="px-6 mb-2 flex-shrink-0">
          <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-75 ease-linear"
              style={{
                width: `${(timeLeft / TIMER_DURATION_MS) * 100}%`,
                backgroundColor:
                  timeLeft <= 500
                    ? 'var(--color-error, #ef4444)'
                    : timeLeft <= 1000
                    ? '#f59e0b'
                    : 'var(--color-primary)',
              }}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        {currentWord && (
          <div className="w-full max-w-sm text-center animate-fade-in-up">
            <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] mb-8 tracking-tight">
              {currentWord.japanese}
            </h1>

            {phase === 'listening' && (
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-[var(--color-primary)] flex items-center justify-center animate-pulse shadow-lg">
                  <Icon name="mic" size={36} className="text-white" />
                </div>
                <p className="text-lg font-medium text-[var(--color-foreground)] min-h-[1.75rem]">
                  {recognizedText || (
                    <span className="text-[var(--color-muted)]">英語で答えてください...</span>
                  )}
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
                    <p className="text-2xl font-bold text-[var(--color-foreground)]">
                      {currentWord.english}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-full bg-[var(--color-error,#ef4444)] flex items-center justify-center">
                      {isTimedOut ? (
                        <Icon name="timer_off" size={40} className="text-white" />
                      ) : (
                        <Icon name="close" size={40} className="text-white" />
                      )}
                    </div>
                    <p className="text-xl font-bold text-[var(--color-error,#ef4444)]">
                      {isTimedOut ? '時間切れ!' : '不正解'}
                    </p>
                    {recognizedText && !isTimedOut && (
                      <p className="text-base text-[var(--color-muted)] line-through">
                        {recognizedText}
                      </p>
                    )}
                    <div className="mt-2 px-6 py-3 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                      <p className="text-xs text-[var(--color-muted)] mb-1">正解</p>
                      <p className="text-2xl font-bold text-[var(--color-foreground)]">
                        {currentWord.english}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Next button */}
      {phase === 'answered' && (
        <div className="flex-shrink-0 bg-[var(--color-background)] px-6 pt-3 pb-6 safe-area-bottom">
          <Button
            onClick={moveToNext}
            className="w-full max-w-lg mx-auto flex"
            size="lg"
          >
            次へ
            <Icon name="chevron_right" size={20} className="ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
