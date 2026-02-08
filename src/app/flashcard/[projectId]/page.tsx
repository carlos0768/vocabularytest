'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { shuffleArray, getGuestUserId } from '@/lib/utils';
import { loadCollectionWords } from '@/lib/collection-words';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

// Progress storage key generator (localStorage for long-term, sessionStorage for immediate restore)
const getProgressKey = (projectId: string, favoritesOnly: boolean) =>
  `flashcard_progress_${projectId}${favoritesOnly ? '_favorites' : ''}`;
const getSessionKey = (projectId: string, favoritesOnly: boolean) =>
  `flashcard_session_${projectId}${favoritesOnly ? '_favorites' : ''}`;

// Progress data structure
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
  const returnPath = searchParams.get('from');
  const collectionId = searchParams.get('collectionId');
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [japaneseFirst, setJapaneseFirst] = useState(false); // 日→英モード
  
  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEnglish, setEditEnglish] = useState('');
  const [editJapanese, setEditJapanese] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [slidePhase, setSlidePhase] = useState<'exit' | 'enter' | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Track if words have been loaded to prevent re-fetching
  const hasLoadedRef = useRef(false);

  // Save progress to both localStorage (long-term) and sessionStorage (immediate)
  const saveProgress = useCallback((wordList: Word[], index: number) => {
    const progress: FlashcardProgress = {
      wordIds: wordList.map(w => w.id),
      currentIndex: index,
      savedAt: Date.now(),
    };
    const progressStr = JSON.stringify(progress);
    localStorage.setItem(getProgressKey(projectId, favoritesOnly), progressStr);
    sessionStorage.setItem(getSessionKey(projectId, favoritesOnly), progressStr);
  }, [projectId, favoritesOnly]);

  // Navigate back to project (saves progress first)
  const backToProject = useCallback(() => {
    if (words.length > 0) {
      saveProgress(words, currentIndex);
    }
    router.push(returnPath || `/project/${projectId}`);
  }, [words, currentIndex, saveProgress, router, returnPath, projectId]);

  // Load words
  useEffect(() => {
    if (authLoading) return;

    if (!isPro && !favoritesOnly) {
      router.push('/subscription');
      return;
    }

    const loadWords = async () => {
      // Prevent re-fetching if already loaded (handles repository changes)
      if (hasLoadedRef.current && words.length > 0) {
        setLoading(false);
        return;
      }

      try {
        // First, try to restore from sessionStorage (most recent state)
        const sessionKey = getSessionKey(projectId, favoritesOnly);
        const sessionProgressStr = sessionStorage.getItem(sessionKey);
        
        if (sessionProgressStr) {
          try {
            const progress: FlashcardProgress = JSON.parse(sessionProgressStr);
            // Session storage = recent, just check if it's less than 30 minutes old
            const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

            if (progress.savedAt > thirtyMinutesAgo && progress.wordIds.length > 0) {
              // Fetch fresh word data to match with saved IDs
              let wordsData: Word[];
              if (collectionId) {
                wordsData = await loadCollectionWords(collectionId);
              } else if (projectId === 'all' && favoritesOnly) {
                const userId = isPro && user ? user.id : getGuestUserId();
                const projects = await repository.getProjects(userId);
                const allProjectWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
                wordsData = allProjectWords.flat().filter(w => w.isFavorite);
              } else {
                const allWords = await repository.getWords(projectId);
                wordsData = favoritesOnly ? allWords.filter((w) => w.isFavorite) : allWords;
              }

              const wordMap = new Map(wordsData.map(w => [w.id, w]));
              const orderedWords = progress.wordIds
                .map(id => wordMap.get(id))
                .filter((w): w is Word => w !== undefined);

              // Restore only if saved count roughly matches current total
              // If current words grew significantly, discard saved progress
              if (orderedWords.length >= progress.wordIds.length * 0.5 && orderedWords.length >= wordsData.length * 0.8) {
                setWords(orderedWords);
                setCurrentIndex(Math.min(progress.currentIndex, orderedWords.length - 1));
                hasLoadedRef.current = true;
                setLoading(false);
                return;
              }
            }
          } catch {
            sessionStorage.removeItem(sessionKey);
          }
        }

        let wordsData: Word[];

        if (collectionId) {
          // Collection mode: load words from all projects in the collection
          wordsData = await loadCollectionWords(collectionId);
        } else if (projectId === 'all' && favoritesOnly) {
          // 全単語帳横断でお気に入り単語を取得
          const userId = isPro && user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const allProjectWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
          wordsData = allProjectWords.flat().filter(w => w.isFavorite);
        } else {
          let allWords = await repository.getWords(projectId);

          // If local is empty and user is logged in, wait for remote
          if (allWords.length === 0 && user) {
            try {
              allWords = await remoteRepository.getWords(projectId);
            } catch (e) {
              console.error('Remote fallback failed:', e);
            }
          }

          wordsData = favoritesOnly
            ? allWords.filter((w) => w.isFavorite)
            : allWords;
        }

        if (wordsData.length === 0) {
          backToProject();
          return;
        }

        const progressKey = getProgressKey(projectId, favoritesOnly);
        const savedProgressStr = localStorage.getItem(progressKey);

        if (savedProgressStr) {
          try {
            const progress: FlashcardProgress = JSON.parse(savedProgressStr);
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

            if (progress.savedAt > sevenDaysAgo) {
              const wordMap = new Map(wordsData.map(w => [w.id, w]));
              const orderedWords = progress.wordIds
                .map(id => wordMap.get(id))
                .filter((w): w is Word => w !== undefined);

              // Restore only if saved count covers most of the current words
              // Prevents restoring stale subset when words have been added
              if (orderedWords.length >= wordsData.length * 0.8) {
                setWords(orderedWords);
                setCurrentIndex(Math.min(progress.currentIndex, orderedWords.length - 1));
                hasLoadedRef.current = true;
                setLoading(false);
                return;
              }
            }
          } catch {
            localStorage.removeItem(progressKey);
          }
        }

        setWords(shuffleArray(wordsData));
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Failed to load words:', error);
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, authLoading, favoritesOnly, isPro]);

  // Phase 2: Fetch latest from remote in background (Pro users)
  // If remote has more words, merge new words into the end of the list
  useEffect(() => {
    if (authLoading || !user || collectionId || (projectId === 'all' && favoritesOnly)) return;

    const syncRemote = async () => {
      try {
        const remoteWords = await remoteRepository.getWords(projectId);
        if (remoteWords.length === 0) return;

        setWords(prev => {
          if (prev.length === 0) return prev;
          // Only update if remote has more words
          if (remoteWords.length <= prev.length) return prev;

          const existingIds = new Set(prev.map(w => w.id));
          const remoteMap = new Map(remoteWords.map(w => [w.id, w]));

          // Keep current order, update existing words with fresh data
          const updated = prev.map(w => remoteMap.get(w.id) ?? w);
          // Append new words not in local
          const newWords = remoteWords.filter(w => !existingIds.has(w.id));
          return [...updated, ...shuffleArray(newWords)];
        });
      } catch {
        // Silent fail - local data is already displayed
      }
    };

    syncRemote();
  }, [authLoading, user, projectId, collectionId, favoritesOnly]);

  // Auto-save progress when index changes
  useEffect(() => {
    if (words.length > 0) {
      saveProgress(words, currentIndex);
    }
  }, [currentIndex, words, saveProgress]);

  // Save progress when leaving the page (multiple events for reliability)
  useEffect(() => {
    const handleSave = () => {
      if (words.length > 0) {
        saveProgress(words, currentIndex);
      }
    };

    // beforeunload: works on desktop
    window.addEventListener('beforeunload', handleSave);
    
    // visibilitychange: works on mobile when switching tabs/apps
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleSave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // pagehide: works on mobile Safari when navigating away
    window.addEventListener('pagehide', handleSave);

    return () => {
      window.removeEventListener('beforeunload', handleSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleSave);
    };
  }, [words, currentIndex, saveProgress]);

  const currentWord = words[currentIndex];

  const handleNext = (withAnimation = false) => {
    if (isAnimating) return;
    
    const nextIndex = currentIndex < words.length - 1 ? currentIndex + 1 : 0;
    
    if (withAnimation) {
      setIsAnimating(true);
      setSlideDirection('left');
      setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setIsFlipped(false);
        setSlidePhase('enter');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setSlidePhase(null);
            setTimeout(() => {
              setSlideDirection(null);
              setIsAnimating(false);
            }, 200);
          });
        });
      }, 200);
    } else {
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
    }
  };

  const handlePrev = (withAnimation = false) => {
    if (isAnimating) return;
    
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : words.length - 1;
    
    if (withAnimation) {
      setIsAnimating(true);
      setSlideDirection('right');
      setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(prevIndex);
        setIsFlipped(false);
        setSlidePhase('enter');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setSlidePhase(null);
            setTimeout(() => {
              setSlideDirection(null);
              setIsAnimating(false);
            }, 200);
          });
        });
      }, 200);
    } else {
      setCurrentIndex(prevIndex);
      setIsFlipped(false);
    }
  };

  const handleFlip = () => {
    if (!isAnimating && !isSwiping.current) {
      setIsFlipped(!isFlipped);
    }
  };

  // Touch handlers for swipe
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

    const threshold = 80;

    if (swipeX < -threshold) {
      handleNext(true);
    } else if (swipeX > threshold) {
      handlePrev(true);
    }

    setSwipeX(0);
    setTimeout(() => {
      isSwiping.current = false;
    }, 50);
  };

  const handleShuffle = () => {
    const shuffled = shuffleArray([...words]);
    setWords(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    saveProgress(shuffled, 0);
  };

  // Keyboard navigation for PC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnimating) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handlePrev(true);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext(true);
          break;
        case ' ':
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          handleFlip();
          break;
        case 'Escape':
          backToProject();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnimating, currentIndex, words.length, isFlipped, projectId, router]);

  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    setWords(prev =>
      prev.map((w, i) =>
        i === currentIndex ? { ...w, isFavorite: newFavorite } : w
      )
    );
  };

  const handleDeleteWord = async () => {
    if (!currentWord) return;

    const confirmed = window.confirm(`「${currentWord.english}」を削除しますか？`);
    if (!confirmed) return;

    await repository.deleteWord(currentWord.id);

    const newWords = words.filter((_, i) => i !== currentIndex);

    if (newWords.length === 0) {
      backToProject();
      return;
    }

    if (currentIndex >= newWords.length) {
      setCurrentIndex(newWords.length - 1);
    }

    setWords(newWords);
    setIsFlipped(false);
  };

  // Speak word
  const speakWord = () => {
    if (currentWord?.english && typeof window !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(currentWord.english);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Open dictionary (Weblio)
  const handleOpenDictionary = () => {
    if (currentWord?.english) {
      window.open(`https://ejje.weblio.jp/content/${encodeURIComponent(currentWord.english)}`, '_blank');
    }
  };

  // Open edit modal
  const handleOpenEditModal = () => {
    if (currentWord) {
      setEditEnglish(currentWord.english);
      setEditJapanese(currentWord.japanese);
      setIsEditModalOpen(true);
    }
  };

  // Save edited word
  const handleSaveEdit = async () => {
    if (!currentWord || !editEnglish.trim() || !editJapanese.trim()) return;
    
    setIsSaving(true);
    try {
      await repository.updateWord(currentWord.id, {
        english: editEnglish.trim(),
        japanese: editJapanese.trim(),
      });
      setWords(prev =>
        prev.map((w, i) =>
          i === currentIndex
            ? { ...w, english: editEnglish.trim(), japanese: editJapanese.trim() }
            : w
        )
      );
      setIsEditModalOpen(false);
    } catch (error) {
      console.error('Failed to update word:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate card transform
  const getCardTransform = () => {
    if (slidePhase === 'exit') {
      if (slideDirection === 'left') return 'translateX(-120%)';
      if (slideDirection === 'right') return 'translateX(120%)';
    }
    if (slidePhase === 'enter') {
      if (slideDirection === 'left') return 'translateX(120%)';
      if (slideDirection === 'right') return 'translateX(-120%)';
    }
    if (swipeX !== 0) {
      return `translateX(${swipeX}px) rotate(${swipeX * 0.02}deg)`;
    }
    return 'translateX(0)';
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--color-muted)]">フラッシュカードを準備中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] grid grid-rows-[auto_1fr_auto] bg-[var(--color-background)] fixed inset-0">
      {/* Header */}
      <header className="p-4 flex items-center justify-between max-w-lg mx-auto w-full">
        <button
          onClick={backToProject}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <Icon name="close" size={24} />
        </button>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface)] rounded-full shadow-soft">
          <span className="text-[var(--color-primary)] font-bold">{currentIndex + 1}</span>
          <span className="text-[var(--color-muted)]">/</span>
          <span className="text-[var(--color-muted)]">{words.length}</span>
        </div>

        {/* Placeholder for symmetry */}
        <div className="w-10 h-10" />
      </header>

      {/* Favorites badge */}
      {favoritesOnly && (
        <div className="flex justify-center -mt-2 mb-2">
          <div className="chip chip-tough">
            <Icon name="flag" size={16} filled />
            <span>苦手な単語</span>
          </div>
        </div>
      )}

      {/* Card area */}
      <main className="flex items-center justify-center px-6 touch-pan-y overflow-hidden min-h-0">
        {/* Flashcard */}
        <div
          onClick={handleFlip}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="flashcard w-full max-w-sm aspect-[3/4] max-h-full cursor-pointer"
          style={{
            transform: getCardTransform(),
            transition: slidePhase === 'enter' ? 'none' : (isAnimating || swipeX === 0 ? 'transform 0.2s ease-out' : 'none'),
          }}
        >
          <div className={`flashcard-inner ${isFlipped ? 'flipped' : ''}`}>
            {/* Front */}
            <div className="flashcard-face flashcard-front shadow-card">
              {/* Mode badge */}
              <div className="absolute top-6 left-6">
                <span className="px-3 py-1 bg-[var(--color-primary-light)] text-[var(--color-muted)] text-xs font-semibold rounded-full uppercase tracking-wide">
                  {japaneseFirst ? '日→英' : '英→日'}
                </span>
              </div>

              {/* Voice button (only for English side) */}
              {!japaneseFirst && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord();
                  }}
                  className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors text-[var(--color-primary)]"
                  aria-label="発音を聞く"
                >
                  <Icon name="volume_up" size={24} />
                </button>
              )}

              {/* Word */}
              <h1 className="text-4xl font-extrabold text-[var(--color-foreground)] text-center tracking-tight">
                {japaneseFirst ? currentWord?.japanese : currentWord?.english}
              </h1>

              {/* Hint */}
              <p className="absolute bottom-6 text-sm text-[var(--color-muted)]">
                タップして{japaneseFirst ? '英語' : '意味'}を表示
              </p>
            </div>

            {/* Back */}
            <div className="flashcard-face flashcard-back">
              {/* Voice button (for Japanese first mode, show on back) */}
              {japaneseFirst && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord();
                  }}
                  className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors text-white"
                  aria-label="発音を聞く"
                >
                  <Icon name="volume_up" size={24} />
                </button>
              )}

              <h2 className="text-3xl font-bold text-white text-center">
                {japaneseFirst ? currentWord?.english : currentWord?.japanese}
              </h2>

              <p className="absolute bottom-6 text-sm text-white/60">
                タップして戻る
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom controls */}
      <div
        className="px-4 sm:px-6 pt-1 sm:pt-2"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Action buttons */}
        <div className="flex justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <button
            onClick={() => {
              setJapaneseFirst(!japaneseFirst);
              setIsFlipped(false);
            }}
            className={`w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full shadow-soft hover:shadow-md transition-all ${
              japaneseFirst
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
            }`}
            aria-label={japaneseFirst ? '英→日モードに切替' : '日→英モードに切替'}
          >
            <Icon name="translate" size={18} />
          </button>

          <button
            onClick={handleToggleFavorite}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all"
            aria-label={currentWord?.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Icon
              name="flag"
              size={18}
              filled={currentWord?.isFavorite}
              className={`transition-colors ${
                currentWord?.isFavorite
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-muted)]'
              }`}
            />
          </button>

          <button
            onClick={handleOpenDictionary}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all text-[var(--color-muted)]"
            aria-label="辞書で調べる"
          >
            <Icon name="search" size={18} />
          </button>

          <button
            onClick={handleOpenEditModal}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all text-[var(--color-muted)]"
            aria-label="単語を編集"
          >
            <Icon name="edit" size={18} />
          </button>

          <button
            onClick={handleDeleteWord}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md hover:bg-[var(--color-error-light)] transition-all text-[var(--color-muted)] hover:text-[var(--color-error)]"
            aria-label="この単語を削除"
          >
            <Icon name="delete" size={18} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => handlePrev(true)}
            disabled={isAnimating}
            className="w-12 h-12 sm:w-14 sm:h-14"
          >
            <Icon name="chevron_left" size={24} />
          </Button>

          {/* Flip button */}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setIsFlipped(!isFlipped)}
            disabled={isAnimating}
            className="w-12 h-12 sm:w-14 sm:h-14"
            aria-label="カードをめくる"
          >
            <Icon name="refresh" size={24} />
          </Button>

          {/* Next button */}
          <Button
            variant="secondary"
            onClick={() => handleNext(true)}
            disabled={isAnimating}
            className="w-12 h-12 sm:w-14 sm:h-14"
            size="icon"
          >
            <Icon name="chevron_right" size={24} />
          </Button>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-[var(--color-background)] rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-4">単語を編集</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-muted)] mb-1">
                  英語
                </label>
                <input
                  type="text"
                  value={editEnglish}
                  onChange={(e) => setEditEnglish(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="英単語"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-[var(--color-muted)] mb-1">
                  日本語
                </label>
                <input
                  type="text"
                  value={editJapanese}
                  onChange={(e) => setEditJapanese(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="日本語訳"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] font-semibold hover:bg-[var(--color-surface)] transition-colors"
                disabled={isSaving}
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving || !editEnglish.trim() || !editJapanese.trim()}
                className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
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
