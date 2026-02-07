'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import type { Word, SubscriptionStatus } from '@/types';

type QuizDirection = 'ja-to-en' | 'en-to-ja';
type QuizPhase = 'setup' | 'playing' | 'photo' | 'grading' | 'result';

const DEFAULT_INTERVAL = 5; // seconds
const DEFAULT_QUESTION_COUNT = 10;

function DictationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Quiz state
  const [phase, setPhase] = useState<QuizPhase>('setup');
  const [words, setWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);
  const [direction, setDirection] = useState<QuizDirection>('ja-to-en');
  const [interval, setInterval] = useState(DEFAULT_INTERVAL);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [loading, setLoading] = useState(true);

  // Photo grading state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [grading, setGrading] = useState(false);
  const [results, setResults] = useState<{ question: Word; userAnswer: string; isCorrect: boolean }[]>([]);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load words
  useEffect(() => {
    if (authLoading) return;

    const loadWords = async () => {
      setLoading(true);
      try {
        let loadedWords: Word[] = [];

        if (projectId) {
          // Load from specific project
          if (user) {
            try {
              loadedWords = await remoteRepository.getWords(projectId);
            } catch (e) {
              console.error('Remote fetch failed:', e);
            }
          }
          if (loadedWords.length === 0) {
            loadedWords = await repository.getWords(projectId);
          }
        } else {
          // Load all words from all projects
          const userId = isPro && user ? user.id : getGuestUserId();
          let projects = user ? await remoteRepository.getProjects(user.id) : [];
          if (projects.length === 0) {
            projects = await repository.getProjects(userId);
          }
          const allWords = await Promise.all(
            projects.map(async (p) => {
              if (user) {
                try {
                  return await remoteRepository.getWords(p.id);
                } catch {
                  return await repository.getWords(p.id);
                }
              }
              return repository.getWords(p.id);
            })
          );
          loadedWords = allWords.flat();
        }

        setWords(loadedWords);
      } catch (error) {
        console.error('Failed to load words:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [authLoading, isPro, user, repository, projectId]);

  // Text-to-Speech function
  const speak = useCallback((text: string, lang: 'ja-JP' | 'en-US') => {
    return new Promise<void>((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Speak current question
  const speakCurrentQuestion = useCallback(async () => {
    if (questions.length === 0 || currentIndex >= questions.length) return;

    const question = questions[currentIndex];
    const text = direction === 'ja-to-en' ? question.japanese : question.english;
    const lang = direction === 'ja-to-en' ? 'ja-JP' : 'en-US';

    await speak(text, lang);
  }, [questions, currentIndex, direction, speak]);

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying || phase !== 'playing') return;

    // Speak the question first
    speakCurrentQuestion();

    // Set timer for auto-advance
    timerRef.current = setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setMaxReachedIndex((prev) => Math.max(prev, nextIndex));
      } else {
        // Quiz finished
        setIsPlaying(false);
        setPhase('photo');
      }
    }, interval * 1000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPlaying, phase, currentIndex, questions.length, interval, speakCurrentQuestion]);

  // Start quiz
  const startQuiz = useCallback(() => {
    const shuffled = shuffleArray(words).slice(0, DEFAULT_QUESTION_COUNT);
    setQuestions(shuffled);
    setCurrentIndex(0);
    setMaxReachedIndex(0);
    setPhase('playing');
    setIsPlaying(true);
  }, [words]);

  // Navigation
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      window.speechSynthesis.cancel();
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrentIndex(currentIndex - 1);
      // Don't auto-advance when manually navigating
      setIsPlaying(false);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < maxReachedIndex) {
      window.speechSynthesis.cancel();
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrentIndex(currentIndex + 1);
      setIsPlaying(false);
    }
  }, [currentIndex, maxReachedIndex]);

  const resumePlayback = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pausePlayback = useCallback(() => {
    window.speechSynthesis.cancel();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPlaying(false);
  }, []);

  // Replay current question
  const replayQuestion = useCallback(() => {
    speakCurrentQuestion();
  }, [speakCurrentQuestion]);

  // Handle photo upload
  const handlePhotoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
    }
  }, []);

  // Grade answers
  const gradeAnswers = useCallback(async () => {
    if (!photoFile) return;

    setGrading(true);
    setPhase('grading');

    try {
      // Convert image to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(photoFile);
      });
      const base64Image = await base64Promise;

      // Prepare question data for API
      const questionData = questions.map((q, i) => ({
        number: i + 1,
        question: direction === 'ja-to-en' ? q.japanese : q.english,
        correctAnswer: direction === 'ja-to-en' ? q.english : q.japanese,
      }));

      // Call grading API
      const response = await fetch('/api/dictation/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          questions: questionData,
          direction,
        }),
      });

      if (!response.ok) {
        throw new Error('Grading failed');
      }

      const data = await response.json();

      // Map results
      const gradedResults = questions.map((q, i) => ({
        question: q,
        userAnswer: data.answers?.[i]?.userAnswer || '(読み取れず)',
        isCorrect: data.answers?.[i]?.isCorrect || false,
      }));

      setResults(gradedResults);
      setPhase('result');
    } catch (error) {
      console.error('Grading error:', error);
      alert('採点に失敗しました。もう一度お試しください。');
      setPhase('photo');
    } finally {
      setGrading(false);
    }
  }, [photoFile, questions, direction]);

  // Back to home
  const goBack = useCallback(() => {
    router.push('/');
  }, [router]);

  // Restart quiz
  const restartQuiz = useCallback(() => {
    setPhase('setup');
    setQuestions([]);
    setCurrentIndex(0);
    setMaxReachedIndex(0);
    setPhotoFile(null);
    setResults([]);
  }, []);

  if (loading || authLoading) {
    return (
      <AppShell>
        <div className="min-h-screen flex items-center justify-center">
          <Icon name="progress_activity" className="animate-spin text-[var(--color-muted)]" size={24} />
        </div>
      </AppShell>
    );
  }

  if (words.length < DEFAULT_QUESTION_COUNT) {
    return (
      <AppShell>
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
          <Icon name="volume_off" size={48} className="text-[var(--color-muted)] mb-4" />
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語が足りません</h1>
          <p className="text-sm text-[var(--color-muted)] mt-2">
            ディクテーションには最低{DEFAULT_QUESTION_COUNT}語必要です（現在: {words.length}語）
          </p>
          <Button onClick={goBack} className="mt-6">
            戻る
          </Button>
        </div>
      </AppShell>
    );
  }

  // Setup phase
  if (phase === 'setup') {
    return (
      <AppShell>
        <div className="min-h-screen pb-28 lg:pb-6">
          <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
              <button onClick={goBack} className="p-2 -ml-2 rounded-full hover:bg-[var(--color-surface)]">
                <Icon name="arrow_back" size={24} />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-[var(--color-foreground)]">ディクテーション</h1>
                <p className="text-sm text-[var(--color-muted)]">音声を聞いて書き取り</p>
              </div>
            </div>
          </header>

          <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
            {/* Direction selection */}
            <div className="card p-4 space-y-3">
              <h2 className="font-semibold text-[var(--color-foreground)]">出題形式</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDirection('ja-to-en')}
                  className={`p-4 rounded-xl border-2 transition-colors ${
                    direction === 'ja-to-en'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="text-2xl mb-2">🇯🇵 → 🇺🇸</div>
                  <div className="text-sm font-medium">日本語→英語</div>
                </button>
                <button
                  onClick={() => setDirection('en-to-ja')}
                  className={`p-4 rounded-xl border-2 transition-colors ${
                    direction === 'en-to-ja'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <div className="text-2xl mb-2">🇺🇸 → 🇯🇵</div>
                  <div className="text-sm font-medium">英語→日本語</div>
                </button>
              </div>
            </div>

            {/* Interval setting */}
            <div className="card p-4 space-y-3">
              <h2 className="font-semibold text-[var(--color-foreground)]">読み上げ間隔</h2>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="3"
                  max="15"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-lg font-bold text-[var(--color-foreground)] w-16 text-center">
                  {interval}秒
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="card p-4 bg-[var(--color-primary-light)]">
              <div className="flex gap-3">
                <Icon name="info" size={20} className="text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
                <div className="text-sm text-[var(--color-foreground)]">
                  <p className="font-medium mb-1">ディクテーションの流れ</p>
                  <ol className="list-decimal list-inside space-y-1 text-[var(--color-muted)]">
                    <li>音声で10問出題されます</li>
                    <li>紙に答えを書いてください</li>
                    <li>終わったら紙を撮影して採点</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Start button */}
            <Button onClick={startQuiz} size="lg" className="w-full">
              <Icon name="play_arrow" size={24} className="mr-2" />
              開始
            </Button>
          </main>
        </div>
      </AppShell>
    );
  }

  // Playing phase
  if (phase === 'playing') {
    const progress = ((currentIndex + 1) / questions.length) * 100;

    return (
      <AppShell>
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[var(--color-muted)]">
                  {currentIndex + 1} / {questions.length}
                </span>
                <button
                  onClick={() => {
                    pausePlayback();
                    setPhase('photo');
                  }}
                  className="text-sm text-[var(--color-primary)] font-medium"
                >
                  スキップして採点
                </button>
              </div>
              <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-primary)] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 flex flex-col items-center justify-center px-6">
            {/* Speaking indicator */}
            <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-8 transition-all ${
              isSpeaking
                ? 'bg-[var(--color-primary)] scale-110'
                : 'bg-[var(--color-surface)]'
            }`}>
              <Icon
                name={isSpeaking ? 'volume_up' : 'volume_off'}
                size={48}
                className={isSpeaking ? 'text-white' : 'text-[var(--color-muted)]'}
              />
            </div>

            {/* Status */}
            <p className="text-lg text-[var(--color-muted)] mb-2">
              {isSpeaking ? '読み上げ中...' : isPlaying ? '次の問題まで...' : '一時停止中'}
            </p>

            {/* Direction indicator */}
            <p className="text-sm text-[var(--color-muted)]">
              {direction === 'ja-to-en' ? '日本語 → 英語で回答' : '英語 → 日本語で回答'}
            </p>
          </main>

          {/* Controls */}
          <footer className="sticky bottom-0 bg-[var(--color-background)] border-t border-[var(--color-border-light)] p-4">
            <div className="max-w-lg mx-auto flex items-center justify-center gap-4">
              {/* Previous */}
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className="w-14 h-14 rounded-full bg-[var(--color-surface)] flex items-center justify-center disabled:opacity-30"
              >
                <Icon name="skip_previous" size={28} />
              </button>

              {/* Play/Pause */}
              {isPlaying ? (
                <button
                  onClick={pausePlayback}
                  className="w-16 h-16 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center"
                >
                  <Icon name="pause" size={32} />
                </button>
              ) : (
                <button
                  onClick={resumePlayback}
                  className="w-16 h-16 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center"
                >
                  <Icon name="play_arrow" size={32} />
                </button>
              )}

              {/* Replay */}
              <button
                onClick={replayQuestion}
                className="w-14 h-14 rounded-full bg-[var(--color-surface)] flex items-center justify-center"
              >
                <Icon name="replay" size={28} />
              </button>

              {/* Next */}
              <button
                onClick={goToNext}
                disabled={currentIndex >= maxReachedIndex}
                className="w-14 h-14 rounded-full bg-[var(--color-surface)] flex items-center justify-center disabled:opacity-30"
              >
                <Icon name="skip_next" size={28} />
              </button>
            </div>
          </footer>
        </div>
      </AppShell>
    );
  }

  // Photo upload phase
  if (phase === 'photo') {
    return (
      <AppShell>
        <div className="min-h-screen pb-28 lg:pb-6">
          <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
              <button onClick={restartQuiz} className="p-2 -ml-2 rounded-full hover:bg-[var(--color-surface)]">
                <Icon name="arrow_back" size={24} />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-[var(--color-foreground)]">回答を撮影</h1>
                <p className="text-sm text-[var(--color-muted)]">紙に書いた答えを撮影してください</p>
              </div>
            </div>
          </header>

          <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="aspect-[4/3] border-2 border-dashed border-[var(--color-border)] rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-primary)] transition-colors"
            >
              {photoFile ? (
                <img
                  src={URL.createObjectURL(photoFile)}
                  alt="回答"
                  className="w-full h-full object-contain rounded-2xl"
                />
              ) : (
                <>
                  <Icon name="photo_camera" size={48} className="text-[var(--color-muted)] mb-4" />
                  <p className="text-[var(--color-muted)]">タップして撮影</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {/* Question list for reference */}
            <div className="card p-4">
              <h2 className="font-semibold text-[var(--color-foreground)] mb-3">出題された問題</h2>
              <ol className="space-y-2 text-sm">
                {questions.map((q, i) => (
                  <li key={q.id} className="flex gap-2">
                    <span className="text-[var(--color-muted)]">{i + 1}.</span>
                    <span>{direction === 'ja-to-en' ? q.japanese : q.english}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Grade button */}
            <Button onClick={gradeAnswers} disabled={!photoFile} size="lg" className="w-full">
              <Icon name="grading" size={24} className="mr-2" />
              採点する
            </Button>
          </main>
        </div>
      </AppShell>
    );
  }

  // Grading phase
  if (phase === 'grading') {
    return (
      <AppShell>
        <div className="min-h-screen flex flex-col items-center justify-center">
          <Icon name="progress_activity" className="animate-spin text-[var(--color-primary)] mb-4" size={48} />
          <p className="text-lg text-[var(--color-foreground)]">採点中...</p>
          <p className="text-sm text-[var(--color-muted)]">AIが回答を確認しています</p>
        </div>
      </AppShell>
    );
  }

  // Result phase
  if (phase === 'result') {
    const correctCount = results.filter((r) => r.isCorrect).length;
    const score = Math.round((correctCount / results.length) * 100);

    return (
      <AppShell>
        <div className="min-h-screen pb-28 lg:pb-6">
          <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
              <div className="flex-1">
                <h1 className="text-xl font-bold text-[var(--color-foreground)]">結果</h1>
              </div>
            </div>
          </header>

          <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
            {/* Score */}
            <div className="card p-6 text-center">
              <div className="text-6xl font-bold text-[var(--color-primary)] mb-2">{score}%</div>
              <p className="text-[var(--color-muted)]">
                {correctCount} / {results.length} 問正解
              </p>
            </div>

            {/* Results list */}
            <div className="space-y-3">
              {results.map((result, i) => (
                <div
                  key={result.question.id}
                  className={`card p-4 border-l-4 ${
                    result.isCorrect
                      ? 'border-l-[var(--color-success)]'
                      : 'border-l-[var(--color-error)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      result.isCorrect
                        ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                        : 'bg-[var(--color-error-light)] text-[var(--color-error)]'
                    }`}>
                      <Icon name={result.isCorrect ? 'check' : 'close'} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-muted)] mb-1">
                        問題 {i + 1}: {direction === 'ja-to-en' ? result.question.japanese : result.question.english}
                      </p>
                      <p className="font-medium text-[var(--color-foreground)]">
                        正解: {direction === 'ja-to-en' ? result.question.english : result.question.japanese}
                      </p>
                      {!result.isCorrect && (
                        <p className="text-sm text-[var(--color-error)]">
                          あなたの回答: {result.userAnswer}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button onClick={restartQuiz} variant="secondary" className="flex-1">
                もう一度
              </Button>
              <Button onClick={goBack} className="flex-1">
                ホームへ
              </Button>
            </div>
          </main>
        </div>
      </AppShell>
    );
  }

  return null;
}

export default function DictationPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="min-h-screen flex items-center justify-center">
          <Icon name="progress_activity" className="animate-spin text-[var(--color-muted)]" size={24} />
        </div>
      </AppShell>
    }>
      <DictationContent />
    </Suspense>
  );
}
