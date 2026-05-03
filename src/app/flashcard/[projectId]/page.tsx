'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import { sortWordsByPriority } from '@/lib/spaced-repetition';
import { loadCollectionWords } from '@/lib/collection-words';
import { useAuth } from '@/hooks/use-auth';
import { getCachedProjectWords, getHasLoaded } from '@/lib/home-cache';
import type { Word, SubscriptionStatus } from '@/types';

/* ---------- Mastery level (mirrors iOS) ---------- */
function getMasteryLevel(repetition: number): number {
  if (repetition === 0) return 0;
  if (repetition <= 2) return 1;
  if (repetition <= 5) return 2;
  return 3;
}

/* ---------- Mastery dots (DS component) ---------- */
function MasteryDots({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-[5px]">
      <span className="mr-1 font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--color-muted)]">MASTERY</span>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: i < level ? 'var(--color-success)' : 'rgba(26,26,26,0.08)',
            border: `1px solid ${i < level ? 'var(--color-success)' : 'var(--color-border)'}`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Action chip (DS component) ---------- */
function ActionChip({
  icon,
  label,
  tint = 'var(--solid-ink)',
  filled,
  onClick,
}: {
  icon: string;
  label: string;
  tint?: string;
  filled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-[5px]">
      <div
        className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_2px_0_var(--solid-ink)]"
        style={{ color: tint }}
      >
        <Icon name={icon} size={16} filled={filled} />
      </div>
      <span className="text-[10px] font-semibold text-[var(--color-muted)]">{label}</span>
    </button>
  );
}

/* ---------- Progress storage ---------- */
const getProgressKey = (projectId: string, favoritesOnly: boolean) =>
  `flashcard_progress_${projectId}${favoritesOnly ? '_favorites' : ''}`;
const getSessionKey = (projectId: string, favoritesOnly: boolean) =>
  `flashcard_session_${projectId}${favoritesOnly ? '_favorites' : ''}`;

interface FlashcardProgress {
  wordIds: string[];
  currentIndex: number;
  savedAt: number;
}

export default function FlashcardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const favoritesOnly = searchParams.get('favorites') === 'true';
  const collectionId = searchParams.get('collectionId');
  const { user, subscription, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  /* Edit modal */
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEnglish, setEditEnglish] = useState('');
  const [editJapanese, setEditJapanese] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  /* Swipe state */
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [slidePhase, setSlidePhase] = useState<'exit' | 'enter' | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const hasLoadedRef = useRef(false);
  const cacheRestoredRef = useRef(false);

  /* Phase 0: instant restore from home-cache */
  useLayoutEffect(() => {
    if (cacheRestoredRef.current || hasLoadedRef.current) return;
    if (!getHasLoaded()) return;
    cacheRestoredRef.current = true;
    const cachedWords = getCachedProjectWords()[projectId];
    if (cachedWords && cachedWords.length > 0 && !favoritesOnly && !collectionId) {
      const sorted = sortWordsByPriority(cachedWords);
      setWords(sorted);
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [projectId, favoritesOnly, collectionId]);

  const saveProgress = useCallback((wordList: Word[], index: number) => {
    const progress: FlashcardProgress = { wordIds: wordList.map(w => w.id), currentIndex: index, savedAt: Date.now() };
    const str = JSON.stringify(progress);
    localStorage.setItem(getProgressKey(projectId, favoritesOnly), str);
    sessionStorage.setItem(getSessionKey(projectId, favoritesOnly), str);
  }, [projectId, favoritesOnly]);

  const backToProject = useCallback(() => {
    if (words.length > 0) saveProgress(words, currentIndex);
    router.back();
  }, [words, currentIndex, saveProgress, router]);

  useEffect(() => {
    if (authLoading) return;
    const loadWords = async () => {
      if (hasLoadedRef.current && words.length > 0) { setLoading(false); return; }
      try {
        const ensureProjectAccess = async (): Promise<boolean> => {
          const ownerUserId = user ? user.id : getGuestUserId();
          try {
            const localProject = await repository.getProject(projectId);
            if (localProject?.userId === ownerUserId) return true;
          } catch { /* continue */ }
          if (!navigator.onLine) return true;
          if (user) {
            try { return (await remoteRepository.getProject(projectId))?.userId === ownerUserId; }
            catch { return true; }
          }
          return false;
        };

        /* Try session storage first */
        const sessionProgressStr = sessionStorage.getItem(getSessionKey(projectId, favoritesOnly));
        if (sessionProgressStr) {
          try {
            const progress: FlashcardProgress = JSON.parse(sessionProgressStr);
            if (progress.savedAt > Date.now() - 30 * 60 * 1000 && progress.wordIds.length > 0) {
              let wordsData: Word[];
              if (collectionId) {
                wordsData = await loadCollectionWords(collectionId);
              } else if (projectId === 'all' && favoritesOnly) {
                const userId = user ? user.id : getGuestUserId();
                const projects = await repository.getProjects(userId);
                const allWordsArrays = await Promise.all(projects.map(p => repository.getWords(p.id)));
                wordsData = allWordsArrays.flat().filter(w => w.isFavorite);
              } else {
                const hasAccess = await ensureProjectAccess();
                if (!hasAccess) { backToProject(); return; }
                wordsData = await repository.getWords(projectId);
                if (wordsData.length === 0 && user && navigator.onLine) {
                  try { wordsData = await remoteRepository.getWords(projectId); } catch { /* ignore */ }
                }
              }
              const byId = new Map(wordsData.map(w => [w.id, w]));
              const ordered = progress.wordIds.map(id => byId.get(id)).filter(Boolean) as Word[];
              if (ordered.length > 0) {
                setWords(ordered);
                setCurrentIndex(Math.min(progress.currentIndex, ordered.length - 1));
                hasLoadedRef.current = true;
                setLoading(false);
                return;
              }
            }
          } catch { /* fall through */ }
        }

        /* Try localStorage progress */
        const localProgressStr = localStorage.getItem(getProgressKey(projectId, favoritesOnly));
        let savedIndex = 0;
        let savedWordIds: string[] = [];
        if (localProgressStr) {
          try {
            const progress: FlashcardProgress = JSON.parse(localProgressStr);
            if (progress.savedAt > Date.now() - 7 * 24 * 60 * 60 * 1000) {
              savedWordIds = progress.wordIds;
              savedIndex = progress.currentIndex;
            }
          } catch { /* ignore */ }
        }

        let loadedWords: Word[];
        if (collectionId) {
          loadedWords = await loadCollectionWords(collectionId);
        } else if (projectId === 'all' && favoritesOnly) {
          const userId = user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const arrays = await Promise.all(projects.map(p => repository.getWords(p.id)));
          loadedWords = arrays.flat().filter(w => w.isFavorite);
        } else {
          const hasAccess = await ensureProjectAccess();
          if (!hasAccess) { backToProject(); return; }
          loadedWords = await repository.getWords(projectId);
          if (loadedWords.length === 0 && user && navigator.onLine) {
            try { loadedWords = await remoteRepository.getWords(projectId); } catch { /* ignore */ }
          }
        }

        if (loadedWords.length === 0) { backToProject(); return; }

        const sorted = sortWordsByPriority(loadedWords);
        let finalWords = sorted;

        if (savedWordIds.length > 0) {
          const byId = new Map(loadedWords.map(w => [w.id, w]));
          const ordered = savedWordIds.map(id => byId.get(id)).filter(Boolean) as Word[];
          if (ordered.length > 0) {
            finalWords = ordered;
            savedIndex = Math.min(savedIndex, ordered.length - 1);
          }
        }

        setWords(finalWords);
        setCurrentIndex(savedIndex);
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Failed to load flashcard words:', error);
        backToProject();
      } finally {
        setLoading(false);
      }
    };
    loadWords();
  }, [authLoading, projectId, favoritesOnly, collectionId, repository, user, backToProject, words.length]);

  /* Save on unload */
  useEffect(() => {
    const handleSave = () => { if (words.length > 0) saveProgress(words, currentIndex); };
    const handleVisibilityChange = () => { if (document.visibilityState === 'hidden') handleSave(); };
    window.addEventListener('beforeunload', handleSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleSave);
    return () => {
      window.removeEventListener('beforeunload', handleSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleSave);
    };
  }, [words, currentIndex, saveProgress]);

  const currentWord = words[currentIndex];

  const handleNext = useCallback((withAnimation = false) => {
    if (isAnimating) return;
    const nextIndex = currentIndex < words.length - 1 ? currentIndex + 1 : 0;
    if (withAnimation) {
      setIsAnimating(true); setSlideDirection('left'); setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(nextIndex); setIsFlipped(false); setSlidePhase('enter');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        }));
      }, 200);
    } else {
      setCurrentIndex(nextIndex); setIsFlipped(false);
    }
  }, [isAnimating, currentIndex, words.length]);

  const handlePrev = useCallback((withAnimation = false) => {
    if (isAnimating) return;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : words.length - 1;
    if (withAnimation) {
      setIsAnimating(true); setSlideDirection('right'); setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(prevIndex); setIsFlipped(false); setSlidePhase('enter');
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        }));
      }, 200);
    } else {
      setCurrentIndex(prevIndex); setIsFlipped(false);
    }
  }, [isAnimating, currentIndex, words.length]);

  const handleFlip = useCallback(() => {
    if (!isAnimating && !isSwiping.current) setIsFlipped((prev) => !prev);
  }, [isAnimating]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (isAnimating) return;
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
      setSwipeX(deltaX);
    }
  };
  const handleTouchEnd = () => {
    if (isAnimating) return;
    if (swipeX < -80) handleNext(true);
    else if (swipeX > 80) handlePrev(true);
    setSwipeX(0);
    setTimeout(() => { isSwiping.current = false; }, 50);
  };

  const handleShuffle = () => {
    const shuffled = shuffleArray([...words]);
    setWords(shuffled); setCurrentIndex(0); setIsFlipped(false);
    saveProgress(shuffled, 0);
  };

  /* Keyboard nav */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditModalOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (isAnimating) return;
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); handlePrev(true); break;
        case 'ArrowRight': e.preventDefault(); handleNext(true); break;
        case ' ': case 'ArrowUp': case 'ArrowDown': e.preventDefault(); handleFlip(); break;
        case 'Escape': backToProject(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnimating, isEditModalOpen, currentIndex, words.length, isFlipped, handlePrev, handleNext, handleFlip, backToProject]);

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, isFavorite: newFavorite } : w));
  };

  const handleDeleteWord = async () => {
    if (!currentWord) return;
    const confirmed = window.confirm(`「${currentWord.english}」を削除しますか？`);
    if (!confirmed) return;
    await repository.deleteWord(currentWord.id);
    const newWords = words.filter((_, i) => i !== currentIndex);
    if (newWords.length === 0) { backToProject(); return; }
    if (currentIndex >= newWords.length) setCurrentIndex(newWords.length - 1);
    setWords(newWords); setIsFlipped(false);
  };

  function speakWord() {
    if (currentWord?.english && typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(currentWord.english);
      utt.lang = 'en-US'; utt.rate = 0.9;
      window.speechSynthesis.speak(utt);
    }
  }

  const handleOpenEditModal = () => {
    if (currentWord) {
      setEditEnglish(currentWord.english); setEditJapanese(currentWord.japanese); setIsEditModalOpen(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!currentWord || !editEnglish.trim() || !editJapanese.trim()) return;
    setIsSaving(true);
    try {
      await repository.updateWord(currentWord.id, { english: editEnglish.trim(), japanese: editJapanese.trim() });
      setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, english: editEnglish.trim(), japanese: editJapanese.trim() } : w));
      setIsEditModalOpen(false);
    } catch (error) { console.error('Failed to update word:', error); }
    finally { setIsSaving(false); }
  };

  /* Card transform */
  const getCardTransform = () => {
    if (slidePhase === 'exit') {
      if (slideDirection === 'left') return 'translateX(-120%)';
      if (slideDirection === 'right') return 'translateX(120%)';
    }
    if (slidePhase === 'enter') {
      if (slideDirection === 'left') return 'translateX(120%)';
      if (slideDirection === 'right') return 'translateX(-120%)';
    }
    if (swipeX !== 0) return `translateX(${swipeX}px) rotate(${swipeX * 0.02}deg)`;
    return 'translateX(0)';
  };

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--solid-ink)] border-t-transparent" />
          <p className="text-[var(--color-muted)]">フラッシュカードを準備中...</p>
        </div>
      </div>
    );
  }

  const masteryLevel = getMasteryLevel(currentWord?.repetition ?? 0);
  const total = words.length;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-background)] pt-3 font-[var(--font-body)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-2">
        <button type="button" onClick={backToProject} className="inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]">
          <Icon name="close" size={18} />
        </button>
        <div className="flex flex-1 flex-col items-center gap-[3px]">
          <div className="font-mono text-[11px] font-bold tabular-nums text-[var(--solid-ink)]">
            {currentIndex + 1}<span className="text-[var(--color-muted)]">/{total}</span>
          </div>
          <div className="h-1 w-[140px] overflow-hidden rounded-sm bg-[rgba(26,26,26,0.08)]">
            <div className="h-full bg-[var(--solid-ink)]" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
          </div>
        </div>
        <button type="button" onClick={handleShuffle} className="inline-flex h-8 w-8 items-center justify-center text-[var(--solid-ink)]">
          <Icon name="shuffle" size={18} />
        </button>
      </div>

      {/* Sub header: project name + mastery dots */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-2">
        <div className="text-[11px] font-semibold text-[var(--color-muted)]">
          {currentWord?.partOfSpeechTags?.[0] ?? ''}
        </div>
        <MasteryDots level={masteryLevel} />
      </div>

      {/* Card area */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-1">
        {/* Ghost cards (stack) */}
        <div
          className="absolute inset-x-9 bottom-10 top-3.5 rounded-[18px] border-[1.25px] border-[var(--color-border)] bg-white opacity-50"
          style={{ transform: 'rotate(-2deg)' }}
        />
        <div
          className="absolute inset-x-7 bottom-8 top-2 rounded-[18px] border-[1.25px] border-[var(--color-border)] bg-white opacity-80"
          style={{ transform: 'rotate(1.5deg)' }}
        />

        {/* Flashcard */}
        <div
          className="relative w-full"
          onClick={handleFlip}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: getCardTransform(),
            transition: slidePhase === 'enter' ? 'none' : (isAnimating || swipeX === 0 ? 'transform 0.2s ease-out' : 'none'),
          }}
        >
          {!isFlipped ? (
            /* Front face (DS style) */
            <div
              className="relative flex min-h-[310px] w-full flex-col rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[#faf7f1] p-[22px_18px_18px]"
              style={{ boxShadow: '4px 4px 0 var(--solid-ink)' }}
            >
              {/* POS badge + favorite */}
              <div className="flex items-center justify-between">
                {currentWord?.partOfSpeechTags?.[0] ? (
                  <div className="rounded border border-[var(--solid-ink)] bg-white px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--solid-ink)]">
                    {currentWord.partOfSpeechTags[0].toUpperCase()}
                  </div>
                ) : <div />}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleToggleFavorite(); }}
                  className={`inline-flex ${currentWord?.isFavorite ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
                >
                  <Icon name="bookmark" size={18} filled={currentWord?.isFavorite} />
                </button>
              </div>

              {/* Big word */}
              <div className="flex flex-1 flex-col items-center justify-center gap-2.5 text-center">
                <div className="font-mono text-xs text-[var(--color-muted)]">{currentWord?.pronunciation ?? ''}</div>
                <div className="font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[var(--solid-ink)]">
                  {currentWord?.english}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); speakWord(); }}
                  className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white px-[13px] py-[7px] text-xs font-bold text-[var(--solid-ink)] shadow-[1.5px_1.5px_0_var(--solid-ink)]"
                >
                  <Icon name="volume_up" size={14} /> 発音
                </button>
              </div>

              {/* Tap hint */}
              <div className="text-center text-[11px] font-semibold text-[var(--color-muted)]">タップで意味を見る</div>
            </div>
          ) : (
            /* Back face */
            <div
              className="relative flex min-h-[310px] w-full flex-col rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--solid-ink)] p-[22px_18px_18px]"
              style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.3)' }}
            >
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <h2 className="text-3xl font-bold text-white">{currentWord?.japanese}</h2>
                <p className="text-sm text-white/60">{currentWord?.english}</p>
                {currentWord?.pronunciation && (
                  <p className="font-mono text-xs text-white/50">{currentWord.pronunciation}</p>
                )}
                {currentWord?.exampleSentence && (
                  <div className="mt-2 w-full rounded-xl bg-white/10 p-3.5 text-left">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[1.5px] text-white/50">例文</p>
                    <p className="text-sm leading-relaxed text-white/90">{currentWord.exampleSentence}</p>
                    {currentWord.exampleSentenceJa && (
                      <p className="mt-1.5 text-xs leading-relaxed text-white/60">{currentWord.exampleSentenceJa}</p>
                    )}
                  </div>
                )}
              </div>
              <div className="text-center text-[11px] font-semibold text-white/50">タップで戻る</div>
            </div>
          )}
        </div>

        {/* Swipe hints */}
        <div className="pointer-events-none absolute left-0.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
          <Icon name="chevron_left" size={20} />
        </div>
        <div className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)]">
          <Icon name="chevron_right" size={20} />
        </div>
      </div>

      {/* Action row (DS style) */}
      <div
        className="flex shrink-0 justify-center gap-3 px-5 pt-2"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <ActionChip icon="edit" label="編集" onClick={handleOpenEditModal} />
        <ActionChip
          icon="bookmark" label="お気に入り"
          tint={currentWord?.isFavorite ? 'var(--color-accent)' : 'var(--solid-ink)'}
          filled={currentWord?.isFavorite}
          onClick={handleToggleFavorite}
        />
        <ActionChip icon="delete" label="削除" tint="var(--color-error)" onClick={handleDeleteWord} />
      </div>

      {/* Edit modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[18px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-background)] p-6 shadow-[3px_4px_0_var(--solid-ink)]">
            <h2 className="mb-4 font-display text-lg font-black text-[var(--solid-ink)]">単語を編集</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">英単語</label>
                <input
                  type="text" value={editEnglish} onChange={(e) => setEditEnglish(e.target.value)}
                  className="w-full rounded-lg border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-sm font-bold text-[var(--solid-ink)] focus:outline-none"
                  placeholder="英単語"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">日本語訳</label>
                <input
                  type="text" value={editJapanese} onChange={(e) => setEditJapanese(e.target.value)}
                  className="w-full rounded-lg border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2.5 text-sm text-[var(--solid-ink)] focus:outline-none"
                  placeholder="日本語訳"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button" onClick={() => setIsEditModalOpen(false)} disabled={isSaving}
                className="flex-1 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--color-muted)]"
              >
                キャンセル
              </button>
              <button
                type="button" onClick={handleSaveEdit}
                disabled={isSaving || !editEnglish.trim() || !editJapanese.trim()}
                className="flex-1 rounded-lg border border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
