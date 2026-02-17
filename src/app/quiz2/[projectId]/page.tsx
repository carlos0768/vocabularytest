'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { loadCollectionWords } from '@/lib/collection-words';
import { getWordsByProjectMap } from '@/lib/projects/load-helpers';
import { findLocalSimilarWords } from '@/lib/similarity/local-similar-words';
import { calculateNextReviewByQuality } from '@/lib/spaced-repetition';
import {
  getGuestUserId,
  shuffleArray,
  recordActivity,
  recordCorrectAnswer,
  recordWrongAnswer,
} from '@/lib/utils';
import type { SubscriptionStatus, Word, WordStatus } from '@/types';

type Quiz2Grade = 'again' | 'hard' | 'good' | 'easy';

interface SimilarWordItem {
  id: string;
  english: string;
  japanese: string;
  similarity: number;
  source: 'vector' | 'local';
}

const QUALITY_BY_GRADE: Record<Quiz2Grade, 1 | 3 | 4 | 5> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

const GRADE_LABELS: Record<Quiz2Grade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

const GRADE_HELPERS: Record<Quiz2Grade, string> = {
  again: '思い出せない',
  hard: '迷いながら',
  good: '普通に思い出せた',
  easy: '余裕で思い出せた',
};

function getStatusAfterGrade(currentStatus: WordStatus, grade: Quiz2Grade): WordStatus {
  if (grade === 'again') {
    if (currentStatus === 'mastered') return 'review';
    return 'new';
  }

  if (grade === 'hard') {
    if (currentStatus === 'new') return 'review';
    return 'review';
  }

  if (grade === 'good') {
    if (currentStatus === 'new') return 'review';
    return 'mastered';
  }

  return 'mastered';
}

async function fetchSimilarBatch(sourceWordIds: string[]): Promise<Record<string, SimilarWordItem[]>> {
  if (sourceWordIds.length === 0) return {};

  const response = await fetch('/api/quiz2/similar/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceWordIds, limit: 3 }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch similar words');
  }

  const payload = await response.json();
  const rawResults = payload?.resultsByWordId;
  if (!rawResults || typeof rawResults !== 'object') return {};

  const parsedResults: Record<string, SimilarWordItem[]> = {};
  for (const [sourceWordId, value] of Object.entries(rawResults as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    parsedResults[sourceWordId] = value
      .map((row) => {
        const typed = row as {
          id?: unknown;
          english?: unknown;
          japanese?: unknown;
          similarity?: unknown;
          source?: unknown;
        };

        if (typeof typed.id !== 'string') return null;
        return {
          id: typed.id,
          english: typeof typed.english === 'string' ? typed.english : '',
          japanese: typeof typed.japanese === 'string' ? typed.japanese : '',
          similarity: typeof typed.similarity === 'number' ? typed.similarity : Number(typed.similarity) || 0,
          source: typed.source === 'local' ? 'local' as const : 'vector' as const,
        };
      })
      .filter((item): item is SimilarWordItem => item !== null)
      .slice(0, 3);
  }

  return parsedResults;
}

export default function Quiz2Page() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const collectionId = searchParams.get('collectionId');
  const returnPath = searchParams.get('from');
  const isCollectionMode = projectId === 'collection';

  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<Word[]>([]);
  const [similarByWordId, setSimilarByWordId] = useState<Record<string, SimilarWordItem[]>>({});
  const [isPreparingSimilar, setIsPreparingSimilar] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<Quiz2Grade | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isFrozenByTabLeave, setIsFrozenByTabLeave] = useState(false);
  const [gradeCounts, setGradeCounts] = useState<Record<Quiz2Grade, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });
  const isFrozenByTabLeaveRef = useRef(false);

  const currentWord = words[currentIndex];
  const currentSimilarWords = currentWord ? (similarByWordId[currentWord.id] || []) : [];

  const speakCurrentWord = useCallback(() => {
    if (!currentWord?.english || typeof window === 'undefined') return;
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentWord.english);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, [currentWord?.english]);

  const backToOrigin = useCallback(() => {
    if (returnPath) {
      router.push(returnPath);
      return;
    }

    if (isCollectionMode) {
      if (collectionId) {
        router.push(`/collections/${collectionId}`);
      } else {
        router.push('/collections');
      }
      return;
    }

    router.push(`/project/${projectId}`);
  }, [returnPath, isCollectionMode, collectionId, router, projectId]);

  const loadAllUserWords = useCallback(async (): Promise<Word[]> => {
    const userId = user ? user.id : getGuestUserId();
    let projects = await repository.getProjects(userId);
    let wordRepo: typeof repository = repository;

    if (projects.length === 0 && user) {
      try {
        projects = await remoteRepository.getProjects(user.id);
        if (projects.length > 0) {
          wordRepo = remoteRepository;
        }
      } catch (error) {
        console.error('Failed to fetch projects from remote repository:', error);
      }
    }

    const projectIds = projects.map((project) => project.id);
    if (projectIds.length === 0) return [];

    const wordsByProject = await getWordsByProjectMap(wordRepo, projectIds);
    return projectIds.flatMap((id) => wordsByProject[id] ?? []);
  }, [repository, user]);

  useEffect(() => {
    isFrozenByTabLeaveRef.current = isFrozenByTabLeave;
  }, [isFrozenByTabLeave]);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        isFrozenByTabLeaveRef.current = true;
        setIsFrozenByTabLeave(true);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (authLoading || isFrozenByTabLeave) return;

    if (!isPro) {
      router.push('/subscription');
      return;
    }

    const loadQuizWords = async () => {
      try {
        setLoading(true);

        let sourceWords: Word[] = [];

        if (isCollectionMode) {
          if (!collectionId) {
            backToOrigin();
            return;
          }
          sourceWords = await loadCollectionWords(collectionId);
        } else {
          const ownerUserId = user ? user.id : getGuestUserId();
          let hasAccess = false;

          try {
            const localProject = await repository.getProject(projectId);
            hasAccess = !!localProject && localProject.userId === ownerUserId;
          } catch (error) {
            console.error('Project ownership check failed (local):', error);
          }

          if (!hasAccess && user) {
            try {
              const remoteProject = await remoteRepository.getProject(projectId);
              hasAccess = !!remoteProject && remoteProject.userId === ownerUserId;
            } catch (error) {
              console.error('Project ownership check failed (remote):', error);
            }
          }

          if (!hasAccess) {
            backToOrigin();
            return;
          }

          sourceWords = await repository.getWords(projectId);
          if (sourceWords.length === 0 && user) {
            try {
              sourceWords = await remoteRepository.getWords(projectId);
            } catch (error) {
              console.error('Remote fallback failed:', error);
            }
          }
        }

        if (sourceWords.length === 0) {
          backToOrigin();
          return;
        }
        if (isFrozenByTabLeaveRef.current) return;

        const shuffledWords = shuffleArray(sourceWords);
        setWords(shuffledWords);
        setCurrentIndex(0);
        setShowAnswer(false);
        setSimilarByWordId({});
        setIsPreparingSimilar(true);
        setIsComplete(false);
        setSelectedGrade(null);
        setIsSubmittingGrade(false);
        setGradeCounts({ again: 0, hard: 0, good: 0, easy: 0 });

        const allWords = await loadAllUserWords();
        const userWordPool = allWords.length > 0 ? allWords : shuffledWords;
        if (isFrozenByTabLeaveRef.current) return;

        let batchSimilar: Record<string, SimilarWordItem[]> = {};
        try {
          batchSimilar = await fetchSimilarBatch(shuffledWords.map((word) => word.id));
        } catch (error) {
          console.error('Failed to fetch similar words batch:', error);
        }
        if (isFrozenByTabLeaveRef.current) return;

        const mergedSimilarByWordId: Record<string, SimilarWordItem[]> = {};
        for (const sourceWord of shuffledWords) {
          const vectorResults = batchSimilar[sourceWord.id] || [];
          const neededCount = Math.max(0, 3 - vectorResults.length);
          const localResults = neededCount > 0
            ? findLocalSimilarWords(sourceWord, userWordPool, {
                limit: neededCount,
                excludeIds: [sourceWord.id, ...vectorResults.map((item) => item.id)],
              }).map((item) => ({
                id: item.id,
                english: item.english,
                japanese: item.japanese,
                similarity: item.score,
                source: 'local' as const,
              }))
            : [];

          mergedSimilarByWordId[sourceWord.id] = [...vectorResults, ...localResults].slice(0, 3);
        }

        setSimilarByWordId(mergedSimilarByWordId);
      } catch (error) {
        console.error('Failed to load quiz2 words:', error);
        backToOrigin();
      } finally {
        if (!isFrozenByTabLeaveRef.current) {
          setIsPreparingSimilar(false);
          setLoading(false);
        }
      }
    };

    loadQuizWords();
  }, [
    authLoading,
    isPro,
    router,
    repository,
    user,
    projectId,
    collectionId,
    isCollectionMode,
    backToOrigin,
    loadAllUserWords,
    isFrozenByTabLeave,
  ]);

  useEffect(() => {
    if (isFrozenByTabLeave || loading || isComplete || !currentWord?.id) return;

    try {
      speakCurrentWord();
    } catch (error) {
      console.error('Failed to play quiz2 question audio:', error);
    }
  }, [currentWord?.id, loading, isComplete, speakCurrentWord, isFrozenByTabLeave]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const goToNext = useCallback(() => {
    if (isFrozenByTabLeaveRef.current) return;
    if (currentIndex + 1 >= words.length) {
      setIsComplete(true);
      setIsSubmittingGrade(false);
      setSelectedGrade(null);
      return;
    }

    setCurrentIndex((prev) => prev + 1);
    setShowAnswer(false);
    setSelectedGrade(null);
    setIsSubmittingGrade(false);
  }, [currentIndex, words.length]);

  const handleGrade = useCallback(async (grade: Quiz2Grade) => {
    if (!currentWord || isSubmittingGrade || isFrozenByTabLeaveRef.current) return;

    setIsSubmittingGrade(true);
    setSelectedGrade(grade);

    try {
      const quality = QUALITY_BY_GRADE[grade];
      const nextStatus = getStatusAfterGrade(currentWord.status, grade);
      const srUpdate = calculateNextReviewByQuality(quality, currentWord);
      const updates = { status: nextStatus, ...srUpdate };

      await repository.updateWord(currentWord.id, updates);
      if (isFrozenByTabLeaveRef.current) return;

      setWords((prev) =>
        prev.map((word, index) =>
          index === currentIndex ? { ...word, ...updates } : word,
        ),
      );
      setGradeCounts((prev) => ({ ...prev, [grade]: prev[grade] + 1 }));

      const becameMastered = currentWord.status !== 'mastered' && nextStatus === 'mastered';
      if (grade === 'again') {
        recordWrongAnswer(
          currentWord.id,
          currentWord.english,
          currentWord.japanese,
          currentWord.projectId,
          currentWord.distractors,
        );
      } else {
        recordCorrectAnswer(becameMastered);
      }
      recordActivity();

      window.setTimeout(goToNext, 220);
    } catch (error) {
      console.error('Failed to update quiz2 result:', error);
      setIsSubmittingGrade(false);
      setSelectedGrade(null);
    }
  }, [currentWord, isSubmittingGrade, repository, currentIndex, goToNext]);

  const handleRestart = useCallback(() => {
    if (words.length === 0 || isFrozenByTabLeaveRef.current) return;
    setWords(shuffleArray([...words]));
    setCurrentIndex(0);
    setShowAnswer(false);
    setSelectedGrade(null);
    setIsSubmittingGrade(false);
    setIsComplete(false);
    setGradeCounts({ again: 0, hard: 0, good: 0, easy: 0 });
  }, [words]);

  if (isFrozenByTabLeave) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] fixed inset-0 p-6">
        <div className="w-full max-w-md card p-6 border-2 border-[var(--color-border)] border-b-4 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning)] flex items-center justify-center mx-auto mb-4">
            <Icon name="pause_circle" size={28} />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">更新を停止しました</h1>
          <p className="text-sm text-[var(--color-muted)] mb-6">
            タブを離れたため、クイズ２の進行を停止しています。
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={backToOrigin}>
              戻る
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                window.location.reload();
              }}
            >
              再読み込み
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">クイズ２を準備中...</p>
        </div>
      </div>
    );
  }

  if (isComplete) {
    const total = words.length;
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        <header className="sticky top-0 p-4 flex items-center justify-between max-w-lg mx-auto w-full">
          <button
            onClick={backToOrigin}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
            aria-label="閉じる"
          >
            <Icon name="close" size={24} />
          </button>
          <div className="chip chip-pro">クイズ２</div>
          <div className="w-10 h-10" />
        </header>

        <main className="flex-1 px-4 pb-8 flex items-center justify-center">
          <div className="w-full max-w-lg card p-6 border-2 border-[var(--color-border)] border-b-4">
            <h1 className="text-2xl font-extrabold text-[var(--color-foreground)] text-center mb-2">完了！</h1>
            <p className="text-sm text-[var(--color-muted)] text-center mb-6">
              {total}語を1周しました
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl bg-[var(--color-error-light)] p-3">
                <p className="text-xs text-[var(--color-muted)]">Again</p>
                <p className="text-xl font-bold text-[var(--color-error)]">{gradeCounts.again}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-warning-light)] p-3">
                <p className="text-xs text-[var(--color-muted)]">Hard</p>
                <p className="text-xl font-bold text-[var(--color-warning)]">{gradeCounts.hard}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-primary-light)] p-3">
                <p className="text-xs text-[var(--color-muted)]">Good</p>
                <p className="text-xl font-bold text-[var(--color-primary)]">{gradeCounts.good}</p>
              </div>
              <div className="rounded-xl bg-[var(--color-success-light)] p-3">
                <p className="text-xs text-[var(--color-muted)]">Easy</p>
                <p className="text-xl font-bold text-[var(--color-success)]">{gradeCounts.easy}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={backToOrigin}>
                戻る
              </Button>
              <Button className="flex-1" onClick={handleRestart}>
                もう一度
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] grid grid-rows-[auto_1fr_auto] bg-[var(--color-background)] fixed inset-0">
      <header className="sticky top-0 p-4 flex items-center justify-between max-w-lg mx-auto w-full">
        <button
          onClick={backToOrigin}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
          aria-label="戻る"
        >
          <Icon name="close" size={24} />
        </button>

        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface)] rounded-full shadow-soft">
          <span className="text-[var(--color-primary)] font-bold">{currentIndex + 1}</span>
          <span className="text-[var(--color-muted)]">/</span>
          <span className="text-[var(--color-muted)]">{words.length}</span>
        </div>

        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)]">
          <Icon name="psychology" size={20} />
        </div>
      </header>

      <main className="px-4 pb-4 overflow-y-auto no-scrollbar">
        <div className="max-w-lg mx-auto space-y-4">
          <section className="card p-6 border-2 border-[var(--color-border)] border-b-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">問題</p>
            <p className="text-4xl font-extrabold text-[var(--color-foreground)] tracking-tight leading-tight">
              {currentWord?.english}
            </p>

            {showAnswer && (
              <div className="mt-6 pt-5 border-t border-[var(--color-border-light)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">答え</p>
                <p className="text-2xl font-bold text-[var(--color-primary)]">{currentWord?.japanese}</p>
              </div>
            )}
          </section>

          {showAnswer && (
            <section className="card p-5 border border-[var(--color-border)]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--color-foreground)]">類義語ペア</h2>
                <span className="text-xs text-[var(--color-muted)]">最大3件</span>
              </div>

              {isPreparingSimilar ? (
                <div className="py-3 text-sm text-[var(--color-muted)] flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                  類似語を準備中...
                </div>
              ) : currentSimilarWords.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)] py-2">類似語がまだ十分にありません。</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {currentSimilarWords.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-[var(--color-foreground)] truncate">{item.english}</p>
                          <p className="text-sm text-[var(--color-muted)] truncate">{item.japanese}</p>
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                            item.source === 'vector'
                              ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                              : 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                          }`}
                        >
                          {item.source === 'vector' ? 'vector' : 'local'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {currentSimilarWords.length < 3 && (
                    <p className="text-xs text-[var(--color-muted)] mt-3">
                      類似語データが不足しているため、{currentSimilarWords.length}件のみ表示しています。
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      </main>

      <div className="px-4 pb-4 safe-area-bottom">
        <div className="max-w-lg mx-auto">
          {!showAnswer ? (
            <Button
              className="w-full h-12"
              onClick={() => setShowAnswer(true)}
              disabled={!currentWord}
            >
              答えを見る
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-muted)] text-center">評価を選ぶと次の問題へ進みます</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleGrade('again')}
                  disabled={isSubmittingGrade}
                  className={`rounded-xl border-2 border-b-4 px-3 py-3 text-left transition-all ${
                    selectedGrade === 'again'
                      ? 'border-[var(--color-error)] bg-[var(--color-error-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--color-error)]">{GRADE_LABELS.again}</p>
                  <p className="text-xs text-[var(--color-muted)]">{GRADE_HELPERS.again}</p>
                </button>
                <button
                  onClick={() => handleGrade('hard')}
                  disabled={isSubmittingGrade}
                  className={`rounded-xl border-2 border-b-4 px-3 py-3 text-left transition-all ${
                    selectedGrade === 'hard'
                      ? 'border-[var(--color-warning)] bg-[var(--color-warning-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--color-warning)]">{GRADE_LABELS.hard}</p>
                  <p className="text-xs text-[var(--color-muted)]">{GRADE_HELPERS.hard}</p>
                </button>
                <button
                  onClick={() => handleGrade('good')}
                  disabled={isSubmittingGrade}
                  className={`rounded-xl border-2 border-b-4 px-3 py-3 text-left transition-all ${
                    selectedGrade === 'good'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--color-primary)]">{GRADE_LABELS.good}</p>
                  <p className="text-xs text-[var(--color-muted)]">{GRADE_HELPERS.good}</p>
                </button>
                <button
                  onClick={() => handleGrade('easy')}
                  disabled={isSubmittingGrade}
                  className={`rounded-xl border-2 border-b-4 px-3 py-3 text-left transition-all ${
                    selectedGrade === 'easy'
                      ? 'border-[var(--color-success)] bg-[var(--color-success-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--color-success)]">{GRADE_LABELS.easy}</p>
                  <p className="text-xs text-[var(--color-muted)]">{GRADE_HELPERS.easy}</p>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
