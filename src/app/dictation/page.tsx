'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import { loadCollectionWords } from '@/lib/collection-words';
import type { Word, SubscriptionStatus } from '@/types';

type QuizDirection = 'ja-to-en' | 'en-to-ja';
type QuizPhase = 'setup' | 'playing' | 'photo' | 'grading' | 'result';

const DEFAULT_INTERVAL = 5;
const DEFAULT_QUESTION_COUNT = 10;

function DictationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const collectionId = searchParams.get('collectionId');
  const returnPath = searchParams.get('from');
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
  const [countdown, setCountdown] = useState(0);

  // Photo grading state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [grading, setGrading] = useState(false);
  const [results, setResults] = useState<{ question: Word; userAnswer: string; isCorrect: boolean }[]>([]);

  // Refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const goBack = useCallback(() => {
    router.push(returnPath || '/');
  }, [router, returnPath]);

  // Load words
  useEffect(() => {
    if (authLoading) return;

    const loadWords = async () => {
      setLoading(true);
      try {
        let loadedWords: Word[] = [];

        if (collectionId) {
          loadedWords = await loadCollectionWords(collectionId);
        } else if (projectId) {
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

  // Countdown timer
  useEffect(() => {
    if (!isPlaying || phase !== 'playing' || isSpeaking) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      return;
    }

    setCountdown(interval);
    countdownRef.current = window.setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [isPlaying, phase, isSpeaking, currentIndex, interval]);

  // Auto-advance timer
  useEffect(() => {
    if (!isPlaying || phase !== 'playing') return;

    speakCurrentQuestion();

    timerRef.current = setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setMaxReachedIndex((prev) => Math.max(prev, nextIndex));
      } else {
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
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(photoFile);
      });
      const base64Image = await base64Promise;

      const questionData = questions.map((q, i) => ({
        number: i + 1,
        question: direction === 'ja-to-en' ? q.japanese : q.english,
        correctAnswer: direction === 'ja-to-en' ? q.english : q.japanese,
      }));

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

  const restartQuiz = useCallback(() => {
    setPhase('setup');
    setQuestions([]);
    setCurrentIndex(0);
    setMaxReachedIndex(0);
    setPhotoFile(null);
    setResults([]);
  }, []);

  // Loading state
  if (loading || authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">読み込み中...</p>
        </div>
      </div>
    );
  }

  // Not enough words
  if (words.length < DEFAULT_QUESTION_COUNT) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="flex-shrink-0 p-4">
          <button
            onClick={goBack}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 bg-[var(--color-surface)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon name="volume_off" size={40} className="text-[var(--color-muted)]" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">単語が足りません</h1>
            <p className="text-[var(--color-muted)] mb-2">
              ディクテーションには最低{DEFAULT_QUESTION_COUNT}語必要です
            </p>
            <p className="text-[var(--color-primary)] font-semibold mb-8">現在: {words.length}語</p>
            <Button onClick={goBack} className="w-full" size="lg">
              戻る
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Setup phase
  if (phase === 'setup') {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        {/* Header */}
        <header className="flex-shrink-0 p-4 flex items-center gap-4">
          <button
            onClick={goBack}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">ディクテーション</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-6 pb-8">
          <div className="max-w-sm mx-auto space-y-6">
            {/* Direction selection */}
            <div>
              <h2 className="font-semibold text-[var(--color-foreground)] mb-3 flex items-center gap-2">
                <Icon name="swap_horiz" size={20} className="text-[var(--color-primary)]" />
                出題形式
              </h2>
              <div className="flex items-center justify-center">
                <div className="inline-flex rounded-full border border-[var(--color-border)] p-1 bg-[var(--color-surface)]">
                  <button
                    onClick={() => setDirection('ja-to-en')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      direction === 'ja-to-en'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    日→英
                  </button>
                  <button
                    onClick={() => setDirection('en-to-ja')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      direction === 'en-to-ja'
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]'
                    }`}
                  >
                    英→日
                  </button>
                </div>
              </div>
            </div>

            {/* Interval setting */}
            <div>
              <h2 className="font-semibold text-[var(--color-foreground)] mb-3 flex items-center gap-2">
                <Icon name="timer" size={20} className="text-[var(--color-primary)]" />
                読み上げ間隔
              </h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-[var(--color-muted)] w-8">3秒</span>
                <div className="flex-1">
                  <input
                    type="range"
                    min="3"
                    max="15"
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--color-border)]
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-6
                      [&::-webkit-slider-thumb]:h-6
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-[var(--color-primary)]
                      [&::-webkit-slider-thumb]:shadow-md
                      [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>
                <span className="text-sm text-[var(--color-muted)] w-10">15秒</span>
              </div>
              <div className="mt-2 text-center">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-sm font-bold">
                  <Icon name="schedule" size={16} />
                  {interval}秒
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="card p-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center flex-shrink-0">
                  <Icon name="lightbulb" size={18} className="text-[var(--color-primary)]" />
                </div>
                <div className="text-sm text-[var(--color-muted)]">
                  <p className="font-semibold text-[var(--color-foreground)] mb-2">ディクテーションの流れ</p>
                  <ol className="space-y-1.5">
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">1</span>
                      音声で10問出題されます
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2</span>
                      紙に答えを書いてください
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3</span>
                      終わったら紙を撮影して採点
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Start button */}
            <Button onClick={startQuiz} className="w-full" size="lg">
              <Icon name="play_circle" size={22} className="mr-2" />
              スタート
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Playing phase
  if (phase === 'playing') {
    const progress = ((currentIndex + 1) / questions.length) * 100;

    return (
      <div className="h-[100dvh] flex flex-col bg-[var(--color-background)] fixed inset-0">
        {/* Header */}
        <header className="flex-shrink-0 p-4 flex items-center gap-4">
          <button
            onClick={() => {
              pausePlayback();
              setPhase('photo');
            }}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>

          {/* Progress bar */}
          <div className="flex-1 progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Progress count */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-[var(--color-primary)] font-bold">{currentIndex + 1}</span>
            <span className="text-[var(--color-muted)]">/</span>
            <span className="text-[var(--color-muted)]">{questions.length}</span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Speaking indicator */}
          <div className="relative mb-8">
            <div
              className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
                isSpeaking
                  ? 'bg-[var(--color-primary)] scale-110'
                  : 'bg-[var(--color-surface)]'
              }`}
            >
              <Icon
                name={isSpeaking ? 'graphic_eq' : isPlaying ? 'hourglass_top' : 'pause'}
                size={48}
                className={`transition-colors duration-300 ${
                  isSpeaking ? 'text-white' : 'text-[var(--color-muted)]'
                }`}
              />
            </div>
          </div>

          {/* Status text */}
          <div className="text-center mb-6">
            <p className={`text-lg font-bold mb-1 ${
              isSpeaking ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
            }`}>
              {isSpeaking ? '読み上げ中...' : isPlaying ? `次の問題まで ${countdown}秒` : '一時停止中'}
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              {direction === 'ja-to-en' ? '日本語を聞いて → 英語で回答' : '英語を聞いて → 日本語で回答'}
            </p>
          </div>

          {/* Countdown circle */}
          {isPlaying && !isSpeaking && (
            <div className="relative w-16 h-16">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-border)" strokeWidth="4" />
                <circle
                  cx="32" cy="32" r="28" fill="none"
                  stroke="var(--color-primary)" strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={176}
                  strokeDashoffset={176 * (1 - countdown / interval)}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-[var(--color-primary)]">
                {countdown}
              </span>
            </div>
          )}
        </main>

        {/* Controls */}
        <div
          className="flex-shrink-0 px-6 pb-6"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-center justify-center gap-3 max-w-sm mx-auto">
            <Button
              variant="secondary"
              size="icon"
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className="w-12 h-12"
            >
              <Icon name="skip_previous" size={24} />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={replayQuestion}
              className="w-12 h-12"
            >
              <Icon name="replay" size={22} />
            </Button>

            {isPlaying ? (
              <Button
                onClick={pausePlayback}
                className="w-16 h-16 rounded-full"
                size="icon"
              >
                <Icon name="pause" size={32} />
              </Button>
            ) : (
              <Button
                onClick={resumePlayback}
                className="w-16 h-16 rounded-full"
                size="icon"
              >
                <Icon name="play_arrow" size={32} />
              </Button>
            )}

            <Button
              variant="secondary"
              size="icon"
              onClick={goToNext}
              disabled={currentIndex >= maxReachedIndex}
              className="w-12 h-12"
            >
              <Icon name="skip_next" size={24} />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                pausePlayback();
                setPhase('photo');
              }}
              className="w-12 h-12"
            >
              <Icon name="photo_camera" size={22} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Photo upload phase
  if (phase === 'photo') {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        {/* Header */}
        <header className="flex-shrink-0 p-4 flex items-center gap-4">
          <button
            onClick={restartQuiz}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">回答を撮影</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-6 pb-8">
          <div className="max-w-sm mx-auto space-y-5">
            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`aspect-[4/3] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
                photoFile
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'
              }`}
            >
              {photoFile ? (
                <div className="relative w-full h-full">
                  <img
                    src={URL.createObjectURL(photoFile)}
                    alt="回答"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center group">
                    <span className="opacity-0 group-hover:opacity-100 text-white font-medium bg-black/50 px-4 py-2 rounded-full transition-opacity">
                      タップして撮り直す
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center p-8">
                  <div className="w-16 h-16 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center mb-4">
                    <Icon name="add_a_photo" size={28} className="text-[var(--color-primary)]" />
                  </div>
                  <p className="text-[var(--color-foreground)] font-medium mb-1">タップして撮影</p>
                  <p className="text-sm text-[var(--color-muted)]">または画像を選択</p>
                </div>
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

            {/* Question list */}
            <div className="card p-4">
              <h2 className="font-semibold text-[var(--color-foreground)] mb-3 flex items-center gap-2">
                <Icon name="format_list_numbered" size={18} className="text-[var(--color-primary)]" />
                出題された問題
              </h2>
              <ol className="space-y-2">
                {questions.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-3 py-1.5 border-b border-[var(--color-border-light)] last:border-0">
                    <span className="w-6 h-6 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm text-[var(--color-foreground)]">
                      {direction === 'ja-to-en' ? q.japanese : q.english}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Grade button */}
            <Button
              onClick={gradeAnswers}
              disabled={!photoFile}
              className="w-full"
              size="lg"
            >
              <Icon name="auto_awesome" size={20} className="mr-2" />
              AIで採点する
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Grading phase
  if (phase === 'grading') {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-bold text-[var(--color-foreground)] mb-1">AIが採点中...</p>
          <p className="text-[var(--color-muted)]">回答を分析しています</p>
        </div>
      </div>
    );
  }

  // Result phase
  if (phase === 'result') {
    const correctCount = results.filter((r) => r.isCorrect).length;
    const percentage = Math.round((correctCount / results.length) * 100);

    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 p-4">
          <button
            onClick={goBack}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          >
            <Icon name="close" size={24} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 pb-8">
          <div className="max-w-sm mx-auto">
            {/* Score card */}
            <div className="card p-8 text-center mb-6">
              <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-6">
                <Icon name="emoji_events" size={40} className="text-[var(--color-success)]" />
              </div>

              <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
                ディクテーション完了!
              </h1>

              <div className="mb-4">
                <p className="text-5xl font-bold text-[var(--color-primary)] mb-1">
                  {percentage}%
                </p>
                <p className="text-[var(--color-muted)]">
                  {results.length}問中 {correctCount}問正解
                </p>
              </div>

              <p className="text-[var(--color-foreground)]">
                {percentage === 100
                  ? 'パーフェクト! 素晴らしい!'
                  : percentage >= 80
                  ? 'よくできました!'
                  : percentage >= 60
                  ? 'もう少し! 復習しましょう'
                  : '繰り返し練習しましょう!'}
              </p>
            </div>

            {/* Results list */}
            <div className="space-y-2 mb-6">
              {results.map((result, i) => (
                <div
                  key={result.question.id}
                  className={`card p-3 border-l-4 ${
                    result.isCorrect
                      ? 'border-l-[var(--color-success)]'
                      : 'border-l-[var(--color-error)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      result.isCorrect
                        ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                        : 'bg-[var(--color-error-light)] text-[var(--color-error)]'
                    }`}>
                      <Icon name={result.isCorrect ? 'check' : 'close'} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--color-muted)] mb-0.5">
                        問題 {i + 1}: {direction === 'ja-to-en' ? result.question.japanese : result.question.english}
                      </p>
                      <p className="text-sm font-medium text-[var(--color-foreground)]">
                        {direction === 'ja-to-en' ? result.question.english : result.question.japanese}
                      </p>
                      {!result.isCorrect && (
                        <p className="text-xs text-[var(--color-error)] mt-0.5">
                          あなたの回答: {result.userAnswer}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button onClick={restartQuiz} className="w-full" size="lg">
                <Icon name="refresh" size={20} className="mr-2" />
                もう一度
              </Button>
              <Button variant="secondary" onClick={goBack} className="w-full" size="lg">
                戻る
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}

export default function DictationPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">読み込み中...</p>
        </div>
      </div>
    }>
      <DictationContent />
    </Suspense>
  );
}
