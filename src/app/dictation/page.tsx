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
import { loadCollectionWords } from '@/lib/collection-words';
import type { Word, SubscriptionStatus } from '@/types';

type QuizDirection = 'ja-to-en' | 'en-to-ja';
type QuizPhase = 'setup' | 'playing' | 'photo' | 'grading' | 'result';

const DEFAULT_INTERVAL = 5;
const DEFAULT_QUESTION_COUNT = 10;

// Animation styles
const pulseKeyframes = `
@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 0.8; }
  50% { transform: scale(1.2); opacity: 0.3; }
  100% { transform: scale(0.8); opacity: 0.8; }
}
@keyframes bounce-subtle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes progress-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes score-pop {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}
`;

function DictationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const collectionId = searchParams.get('collectionId');
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

  // Load words
  useEffect(() => {
    if (authLoading) return;

    const loadWords = async () => {
      setLoading(true);
      try {
        let loadedWords: Word[] = [];

        if (collectionId) {
          // Collection mode: load words from all projects in the collection
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

  const goBack = useCallback(() => {
    router.push('/');
  }, [router]);

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
      <AppShell>
        <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[var(--color-primary)] opacity-20 animate-ping" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center shadow-lg">
              <Icon name="headphones" className="text-white animate-pulse" size={28} />
            </div>
          </div>
          <p className="mt-6 text-[var(--color-muted)] font-medium">読み込み中...</p>
        </div>
      </AppShell>
    );
  }

  // Not enough words
  if (words.length < DEFAULT_QUESTION_COUNT) {
    return (
      <AppShell>
        <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          <div 
            className="w-24 h-24 rounded-full bg-[var(--color-surface)] flex items-center justify-center mb-6 shadow-lg"
            style={{ animation: 'fade-in-up 0.5s ease-out' }}
          >
            <Icon name="volume_off" size={40} className="text-[var(--color-muted)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">単語が足りません</h1>
          <p className="text-[var(--color-muted)] mb-8">
            ディクテーションには最低{DEFAULT_QUESTION_COUNT}語必要です
            <br />
            <span className="text-[var(--color-primary)] font-semibold">現在: {words.length}語</span>
          </p>
          <Button 
            onClick={goBack} 
            size="lg"
            className="px-8 shadow-lg hover:shadow-xl transition-shadow"
          >
            <Icon name="arrow_back" size={20} className="mr-2" />
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
        <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
        <div className="min-h-screen pb-28 lg:pb-6 bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          {/* Header */}
          <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-background)]/80 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
              <button 
                onClick={goBack} 
                className="p-2 -ml-2 rounded-xl hover:bg-[var(--color-surface)] transition-all active:scale-95"
              >
                <Icon name="arrow_back" size={24} />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-[var(--color-foreground)]">ディクテーション</h1>
                <p className="text-sm text-[var(--color-muted)]">音声を聞いて書き取り</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center shadow-lg">
                <Icon name="headphones" size={24} className="text-white" />
              </div>
            </div>
          </header>

          <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
            {/* Direction selection */}
            <div 
              className="bg-[var(--color-surface)] rounded-2xl p-5 shadow-sm border border-[var(--color-border-light)]"
              style={{ animation: 'fade-in-up 0.4s ease-out' }}
            >
              <h2 className="font-semibold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                <Icon name="swap_horiz" size={20} className="text-[var(--color-primary)]" />
                出題形式
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDirection('ja-to-en')}
                  className={`relative p-5 rounded-xl border-2 transition-all duration-300 overflow-hidden ${
                    direction === 'ja-to-en'
                      ? 'border-[var(--color-primary)] bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-surface)] shadow-md scale-[1.02]'
                      : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-border-dark)] hover:shadow-sm'
                  }`}
                >
                  {direction === 'ja-to-en' && (
                    <div className="absolute top-2 right-2">
                      <Icon name="check_circle" size={18} className="text-[var(--color-primary)]" />
                    </div>
                  )}
                  <div className="text-3xl mb-3">🇯🇵 → 🇺🇸</div>
                  <div className="text-sm font-medium text-[var(--color-foreground)]">日本語→英語</div>
                </button>
                <button
                  onClick={() => setDirection('en-to-ja')}
                  className={`relative p-5 rounded-xl border-2 transition-all duration-300 overflow-hidden ${
                    direction === 'en-to-ja'
                      ? 'border-[var(--color-primary)] bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-surface)] shadow-md scale-[1.02]'
                      : 'border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-border-dark)] hover:shadow-sm'
                  }`}
                >
                  {direction === 'en-to-ja' && (
                    <div className="absolute top-2 right-2">
                      <Icon name="check_circle" size={18} className="text-[var(--color-primary)]" />
                    </div>
                  )}
                  <div className="text-3xl mb-3">🇺🇸 → 🇯🇵</div>
                  <div className="text-sm font-medium text-[var(--color-foreground)]">英語→日本語</div>
                </button>
              </div>
            </div>

            {/* Interval setting */}
            <div 
              className="bg-[var(--color-surface)] rounded-2xl p-5 shadow-sm border border-[var(--color-border-light)]"
              style={{ animation: 'fade-in-up 0.5s ease-out' }}
            >
              <h2 className="font-semibold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                <Icon name="timer" size={20} className="text-[var(--color-primary)]" />
                読み上げ間隔
              </h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-[var(--color-muted)] w-8">3秒</span>
                <div className="flex-1 relative">
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
                      [&::-webkit-slider-thumb]:shadow-lg
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-webkit-slider-thumb]:transition-transform
                      [&::-webkit-slider-thumb]:hover:scale-110"
                  />
                </div>
                <span className="text-sm text-[var(--color-muted)] w-10">15秒</span>
              </div>
              <div className="mt-3 text-center">
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] font-bold">
                  <Icon name="schedule" size={18} />
                  {interval}秒
                </span>
              </div>
            </div>

            {/* Info */}
            <div 
              className="bg-gradient-to-br from-[var(--color-primary-light)] to-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-primary)]/20"
              style={{ animation: 'fade-in-up 0.6s ease-out' }}
            >
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0 shadow-md">
                  <Icon name="lightbulb" size={20} className="text-white" />
                </div>
                <div className="text-sm text-[var(--color-foreground)]">
                  <p className="font-semibold mb-2">ディクテーションの流れ</p>
                  <ol className="space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">1</span>
                      <span className="text-[var(--color-muted)]">音声で10問出題されます</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">2</span>
                      <span className="text-[var(--color-muted)]">紙に答えを書いてください</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-xs flex items-center justify-center font-bold">3</span>
                      <span className="text-[var(--color-muted)]">終わったら紙を撮影して採点</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Start button */}
            <button
              onClick={startQuiz}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white font-bold text-lg flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] hover:opacity-90"
              style={{ animation: 'fade-in-up 0.7s ease-out' }}
            >
              <Icon name="play_circle" size={28} />
              スタート
            </button>
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
        <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          {/* Header */}
          <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-background)]/80 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-[var(--color-primary)]">{currentIndex + 1}</span>
                  <span className="text-[var(--color-muted)]">/ {questions.length}</span>
                </div>
                <button
                  onClick={() => {
                    pausePlayback();
                    setPhase('photo');
                  }}
                  className="flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors px-3 py-1.5 rounded-full hover:bg-[var(--color-surface)]"
                >
                  <Icon name="skip_next" size={16} />
                  スキップ
                </button>
              </div>
              
              {/* Progress bar */}
              <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-dark))',
                    boxShadow: '0 0 8px var(--color-primary)'
                  }}
                />
              </div>

              {/* Question dots */}
              <div className="flex justify-center gap-1.5 mt-3">
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i === currentIndex
                        ? 'bg-[var(--color-primary)] scale-125 shadow-md'
                        : i <= maxReachedIndex
                        ? 'bg-[var(--color-primary)]/50'
                        : 'bg-[var(--color-border)]'
                    }`}
                  />
                ))}
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
            {/* Speaking indicator */}
            <div className="relative mb-8">
              {/* Pulse rings */}
              {isSpeaking && (
                <>
                  <div 
                    className="absolute inset-0 rounded-full bg-[var(--color-primary)]"
                    style={{ animation: 'pulse-ring 1.5s ease-out infinite' }}
                  />
                  <div 
                    className="absolute inset-0 rounded-full bg-[var(--color-primary)]"
                    style={{ animation: 'pulse-ring 1.5s ease-out infinite 0.3s' }}
                  />
                  <div 
                    className="absolute inset-0 rounded-full bg-[var(--color-primary)]"
                    style={{ animation: 'pulse-ring 1.5s ease-out infinite 0.6s' }}
                  />
                </>
              )}
              
              {/* Main circle */}
              <div 
                className={`relative w-36 h-36 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl ${
                  isSpeaking
                    ? 'bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] scale-110'
                    : 'bg-[var(--color-surface)]'
                }`}
              >
                <span className={isSpeaking ? 'animate-bounce-subtle' : ''}>
                  <Icon
                    name={isSpeaking ? 'graphic_eq' : isPlaying ? 'hourglass_top' : 'pause'}
                    size={56}
                    className={`transition-colors duration-300 ${
                      isSpeaking ? 'text-white' : 'text-[var(--color-muted)]'
                    }`}
                  />
                </span>
              </div>
            </div>

            {/* Status text */}
            <div className="text-center mb-4">
              <p className={`text-xl font-bold mb-2 transition-colors duration-300 ${
                isSpeaking ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
              }`}>
                {isSpeaking ? '🎧 読み上げ中...' : isPlaying ? `⏳ 次の問題まで ${countdown}秒` : '⏸️ 一時停止中'}
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                {direction === 'ja-to-en' ? '日本語を聞いて → 英語で回答' : '英語を聞いて → 日本語で回答'}
              </p>
            </div>

            {/* Countdown circle (when not speaking) */}
            {isPlaying && !isSpeaking && (
              <div className="relative w-16 h-16">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth="4"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="4"
                    strokeLinecap="round"
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
          <footer className="sticky bottom-0 backdrop-blur-xl bg-[var(--color-background)]/90 border-t border-[var(--color-border-light)] p-4">
            <div className="max-w-lg mx-auto flex items-center justify-center gap-3">
              {/* Previous */}
              <button
                onClick={goToPrevious}
                disabled={currentIndex === 0}
                className="w-14 h-14 rounded-2xl bg-[var(--color-surface)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-[var(--color-surface-hover)] active:scale-95 shadow-md hover:shadow-lg"
              >
                <Icon name="skip_previous" size={28} />
              </button>

              {/* Replay */}
              <button
                onClick={replayQuestion}
                className="w-14 h-14 rounded-2xl bg-[var(--color-surface)] flex items-center justify-center transition-all hover:bg-[var(--color-surface-hover)] active:scale-95 shadow-md hover:shadow-lg"
              >
                <Icon name="replay" size={26} />
              </button>

              {/* Play/Pause - Main button */}
              {isPlaying ? (
                <button
                  onClick={pausePlayback}
                  className="w-18 h-18 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white flex items-center justify-center shadow-xl hover:shadow-2xl transition-all active:scale-95 mx-2"
                  style={{ width: '72px', height: '72px' }}
                >
                  <Icon name="pause" size={36} />
                </button>
              ) : (
                <button
                  onClick={resumePlayback}
                  className="w-18 h-18 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white flex items-center justify-center shadow-xl hover:shadow-2xl transition-all active:scale-95 mx-2"
                  style={{ width: '72px', height: '72px' }}
                >
                  <Icon name="play_arrow" size={36} />
                </button>
              )}

              {/* Next */}
              <button
                onClick={goToNext}
                disabled={currentIndex >= maxReachedIndex}
                className="w-14 h-14 rounded-2xl bg-[var(--color-surface)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-[var(--color-surface-hover)] active:scale-95 shadow-md hover:shadow-lg"
              >
                <Icon name="skip_next" size={28} />
              </button>

              {/* Camera shortcut */}
              <button
                onClick={() => {
                  pausePlayback();
                  setPhase('photo');
                }}
                className="w-14 h-14 rounded-2xl bg-[var(--color-surface)] flex items-center justify-center transition-all hover:bg-[var(--color-surface-hover)] active:scale-95 shadow-md hover:shadow-lg"
              >
                <Icon name="photo_camera" size={24} />
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
        <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
        <div className="min-h-screen pb-28 lg:pb-6 bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-background)]/80 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
              <button 
                onClick={restartQuiz} 
                className="p-2 -ml-2 rounded-xl hover:bg-[var(--color-surface)] transition-all active:scale-95"
              >
                <Icon name="arrow_back" size={24} />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-[var(--color-foreground)]">回答を撮影</h1>
                <p className="text-sm text-[var(--color-muted)]">紙に書いた答えを撮影してください</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center shadow-lg">
                <Icon name="photo_camera" size={24} className="text-white" />
              </div>
            </div>
          </header>

          <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`aspect-[4/3] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden shadow-lg ${
                photoFile
                  ? 'border-[var(--color-primary)] bg-[var(--color-surface)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]'
              }`}
              style={{ animation: 'fade-in-up 0.4s ease-out' }}
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
                  <div className="w-20 h-20 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center mb-4">
                    <Icon name="add_a_photo" size={36} className="text-[var(--color-primary)]" />
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
            <div 
              className="bg-[var(--color-surface)] rounded-2xl p-5 shadow-sm border border-[var(--color-border-light)]"
              style={{ animation: 'fade-in-up 0.5s ease-out' }}
            >
              <h2 className="font-semibold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                <Icon name="format_list_numbered" size={20} className="text-[var(--color-primary)]" />
                出題された問題
              </h2>
              <ol className="space-y-2">
                {questions.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-3 py-2 border-b border-[var(--color-border-light)] last:border-0">
                    <span className="w-6 h-6 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="text-[var(--color-foreground)]">
                      {direction === 'ja-to-en' ? q.japanese : q.english}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Grade button */}
            <button
              onClick={gradeAnswers}
              disabled={!photoFile}
              className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg transition-all active:scale-[0.98] ${
                photoFile
                  ? 'bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white hover:shadow-xl hover:opacity-90'
                  : 'bg-[var(--color-surface)] text-[var(--color-muted)] cursor-not-allowed'
              }`}
              style={{ animation: 'fade-in-up 0.6s ease-out' }}
            >
              <Icon name="auto_awesome" size={24} />
              AIで採点する
            </button>
          </main>
        </div>
      </AppShell>
    );
  }

  // Grading phase
  if (phase === 'grading') {
    return (
      <AppShell>
        <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          <div className="relative mb-8">
            {/* Animated rings */}
            <div 
              className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/30"
              style={{ 
                width: '160px', 
                height: '160px',
                left: '-32px',
                top: '-32px',
                animation: 'pulse-ring 2s ease-out infinite' 
              }}
            />
            <div 
              className="absolute inset-0 rounded-full border-4 border-[var(--color-primary)]/20"
              style={{ 
                width: '200px', 
                height: '200px',
                left: '-52px',
                top: '-52px',
                animation: 'pulse-ring 2s ease-out infinite 0.5s' 
              }}
            />
            
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center shadow-xl">
              <span className="animate-bounce-subtle">
                <Icon 
                  name="auto_awesome" 
                  className="text-white" 
                  size={40}
                />
              </span>
            </div>
          </div>
          
          <p className="text-xl font-bold text-[var(--color-foreground)] mb-2">AIが採点中...</p>
          <p className="text-[var(--color-muted)]">回答を分析しています</p>
          
          <div className="flex gap-1 mt-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-[var(--color-primary)]"
                style={{
                  animation: 'bounce-subtle 0.6s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`
                }}
              />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // Result phase
  if (phase === 'result') {
    const correctCount = results.filter((r) => r.isCorrect).length;
    const score = Math.round((correctCount / results.length) * 100);
    const scoreEmoji = score >= 80 ? '🎉' : score >= 60 ? '👍' : score >= 40 ? '💪' : '📚';

    return (
      <AppShell>
        <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
        <div className="min-h-screen pb-28 lg:pb-6 bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-background)]/80 border-b border-[var(--color-border-light)]">
            <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
              <div className="flex-1">
                <h1 className="text-xl font-bold text-[var(--color-foreground)]">結果発表</h1>
              </div>
            </div>
          </header>

          <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
            {/* Score card */}
            <div 
              className="bg-gradient-to-br from-[var(--color-primary-light)] via-[var(--color-surface)] to-[var(--color-primary-light)] rounded-2xl p-8 text-center shadow-lg border border-[var(--color-primary)]/20"
              style={{ animation: 'fade-in-up 0.4s ease-out' }}
            >
              <div 
                className="text-6xl mb-4"
                style={{ animation: 'score-pop 0.6s ease-out' }}
              >
                {scoreEmoji}
              </div>
              <div 
                className="text-6xl font-bold bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] bg-clip-text text-transparent mb-2"
                style={{ animation: 'score-pop 0.6s ease-out 0.2s', animationFillMode: 'both' }}
              >
                {score}%
              </div>
              <p className="text-[var(--color-muted)] text-lg">
                <span className="text-[var(--color-primary)] font-bold">{correctCount}</span> / {results.length} 問正解
              </p>
            </div>

            {/* Results list */}
            <div className="space-y-3">
              {results.map((result, i) => (
                <div
                  key={result.question.id}
                  className={`bg-[var(--color-surface)] rounded-xl p-4 shadow-sm border-l-4 transition-all hover:shadow-md ${
                    result.isCorrect
                      ? 'border-l-[var(--color-success)]'
                      : 'border-l-[var(--color-error)]'
                  }`}
                  style={{ animation: `fade-in-up 0.4s ease-out ${0.1 * i}s`, animationFillMode: 'both' }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      result.isCorrect
                        ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                        : 'bg-[var(--color-error-light)] text-[var(--color-error)]'
                    }`}>
                      <Icon name={result.isCorrect ? 'check' : 'close'} size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-muted)] mb-1 flex items-center gap-2">
                        <span className="font-medium">問題 {i + 1}</span>
                        <span className="text-xs">
                          {direction === 'ja-to-en' ? result.question.japanese : result.question.english}
                        </span>
                      </p>
                      <p className="font-medium text-[var(--color-foreground)] flex items-center gap-2">
                        <Icon name="check_circle" size={16} className="text-[var(--color-success)]" />
                        {direction === 'ja-to-en' ? result.question.english : result.question.japanese}
                      </p>
                      {!result.isCorrect && (
                        <p className="text-sm text-[var(--color-error)] mt-1 flex items-center gap-2">
                          <Icon name="edit" size={14} />
                          あなたの回答: {result.userAnswer}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div 
              className="flex gap-3 pt-2"
              style={{ animation: 'fade-in-up 0.6s ease-out' }}
            >
              <button
                onClick={restartQuiz}
                className="flex-1 py-4 rounded-xl bg-[var(--color-surface)] text-[var(--color-foreground)] font-semibold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98] border border-[var(--color-border-light)]"
              >
                <Icon name="replay" size={22} />
                もう一度
              </button>
              <button
                onClick={goBack}
                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] text-white font-semibold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
              >
                <Icon name="home" size={22} />
                ホームへ
              </button>
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-background)] via-[var(--color-surface)] to-[var(--color-background)]">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[var(--color-primary)] opacity-20 animate-ping" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center shadow-lg">
              <Icon name="headphones" className="text-white animate-pulse" size={28} />
            </div>
          </div>
        </div>
      </AppShell>
    }>
      <DictationContent />
    </Suspense>
  );
}
