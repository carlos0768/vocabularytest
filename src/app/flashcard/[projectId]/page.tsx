'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { X, ChevronLeft, ChevronRight, RotateCcw, Flag, Volume2, Trash2, MoreHorizontal, Bookmark, Languages, Search, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/db';
import { shuffleArray } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

// Progress storage key generator
const getProgressKey = (projectId: string, favoritesOnly: boolean) =>
  `flashcard_progress_${projectId}${favoritesOnly ? '_favorites' : ''}`;

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
  const { subscription, isPro, loading: authLoading } = useAuth();

  const backToProject = () => {
    router.push(returnPath || `/project/${projectId}`);
  };

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

  // Save progress to localStorage
  const saveProgress = useCallback((wordList: Word[], index: number) => {
    const progress: FlashcardProgress = {
      wordIds: wordList.map(w => w.id),
      currentIndex: index,
      savedAt: Date.now(),
    };
    localStorage.setItem(getProgressKey(projectId, favoritesOnly), JSON.stringify(progress));
  }, [projectId, favoritesOnly]);

  // Load words
  useEffect(() => {
    if (authLoading) return;

    if (!isPro && !favoritesOnly) {
      router.push('/subscription');
      return;
    }

    const loadWords = async () => {
      try {
        const allWords = await repository.getWords(projectId);
        const wordsData = favoritesOnly
          ? allWords.filter((w) => w.isFavorite)
          : allWords;

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

              if (orderedWords.length >= wordsData.length * 0.8) {
                setWords(orderedWords);
                setCurrentIndex(progress.currentIndex);
                setLoading(false);
                return;
              }
            }
          } catch {
            localStorage.removeItem(progressKey);
          }
        }

        setWords(shuffleArray(wordsData));
      } catch (error) {
        console.error('Failed to load words:', error);
        backToProject();
      } finally {
        setLoading(false);
      }
    };

    loadWords();
  }, [projectId, repository, router, authLoading, favoritesOnly, isPro]);

  // Auto-save progress when index changes
  useEffect(() => {
    if (words.length > 0) {
      saveProgress(words, currentIndex);
    }
  }, [currentIndex, words, saveProgress]);

  // Save progress when leaving the page
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (words.length > 0) {
        saveProgress(words, currentIndex);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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
      <header className="p-4 flex items-center justify-between">
        <button
          onClick={backToProject}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface)] rounded-full shadow-soft">
          <span className="text-[var(--color-primary)] font-bold">{currentIndex + 1}</span>
          <span className="text-[var(--color-muted)]">/</span>
          <span className="text-[var(--color-muted)]">{words.length}</span>
        </div>

        <button
          onClick={() => {}}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
        >
          <MoreHorizontal className="w-6 h-6" />
        </button>
      </header>

      {/* Favorites badge */}
      {favoritesOnly && (
        <div className="flex justify-center -mt-2 mb-2">
          <div className="chip chip-tough">
            <Flag className="w-4 h-4 fill-current" />
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
                <span className="px-3 py-1 bg-[var(--color-peach-light)] text-[var(--color-muted)] text-xs font-semibold rounded-full uppercase tracking-wide">
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
                  <Volume2 className="w-6 h-6" />
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
                  <Volume2 className="w-6 h-6" />
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
        className="px-6 pt-2 pb-8"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Action buttons */}
        <div className="flex justify-center gap-3 mb-4">
          <button
            onClick={handleShuffle}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all text-[var(--color-muted)]"
            aria-label="シャッフル"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              setJapaneseFirst(!japaneseFirst);
              setIsFlipped(false); // Reset flip state when changing mode
            }}
            className={`w-11 h-11 flex items-center justify-center rounded-full shadow-soft hover:shadow-md transition-all ${
              japaneseFirst
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
            }`}
            aria-label={japaneseFirst ? '英→日モードに切替' : '日→英モードに切替'}
          >
            <Languages className="w-5 h-5" />
          </button>

          <button
            onClick={handleToggleFavorite}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all"
            aria-label={currentWord?.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Flag
              className={`w-5 h-5 transition-colors ${
                currentWord?.isFavorite
                  ? 'fill-[var(--color-peach)] text-[var(--color-peach)]'
                  : 'text-[var(--color-muted)]'
              }`}
            />
          </button>

          <button
            onClick={handleOpenDictionary}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all text-[var(--color-muted)]"
            aria-label="辞書で調べる"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={handleOpenEditModal}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md transition-all text-[var(--color-muted)]"
            aria-label="単語を編集"
          >
            <Pencil className="w-5 h-5" />
          </button>

          <button
            onClick={handleDeleteWord}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-[var(--color-surface)] shadow-soft hover:shadow-md hover:bg-[var(--color-error-light)] transition-all text-[var(--color-muted)] hover:text-[var(--color-error)]"
            aria-label="この単語を削除"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="secondary"
            size="icon"
            onClick={() => handlePrev(true)}
            disabled={isAnimating}
            className="w-14 h-14"
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>

          {/* Next button */}
          <Button
            variant="secondary"
            onClick={() => handleNext(true)}
            disabled={isAnimating}
            className="w-14 h-14"
            size="icon"
          >
            <ChevronRight className="w-6 h-6" />
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
