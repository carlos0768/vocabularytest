'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { X, ChevronLeft, ChevronRight, RotateCcw, Flag, Eye, EyeOff, Volume2, Trash2, RefreshCw } from 'lucide-react';
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
  wordIds: string[];  // Order of word IDs (to preserve shuffle order)
  currentIndex: number;
  savedAt: number;  // Timestamp
}

export default function FlashcardPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const favoritesOnly = searchParams.get('favorites') === 'true';
  const { subscription, isPro, loading: authLoading } = useAuth();

  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [slidePhase, setSlidePhase] = useState<'exit' | 'enter' | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  // Get repository based on subscription status
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

    // Redirect non-Pro users (except for favorites mode which is free)
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
          router.push(`/project/${projectId}`);
          return;
        }

        // Check for saved progress
        const progressKey = getProgressKey(projectId, favoritesOnly);
        const savedProgressStr = localStorage.getItem(progressKey);

        if (savedProgressStr) {
          try {
            const progress: FlashcardProgress = JSON.parse(savedProgressStr);
            // Only use saved progress if it's less than 7 days old
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

            if (progress.savedAt > sevenDaysAgo) {
              // Reconstruct word order from saved IDs
              const wordMap = new Map(wordsData.map(w => [w.id, w]));
              const orderedWords = progress.wordIds
                .map(id => wordMap.get(id))
                .filter((w): w is Word => w !== undefined);

              // If most words still exist, resume automatically
              if (orderedWords.length >= wordsData.length * 0.8) {
                setWords(orderedWords);
                setCurrentIndex(progress.currentIndex);
                setLoading(false);
                return;
              }
            }
          } catch {
            // Invalid progress data, ignore
            localStorage.removeItem(progressKey);
          }
        }

        // No valid saved progress - start fresh with shuffled words
        setWords(shuffleArray(wordsData));
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
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
    if (currentIndex < words.length - 1 && !isAnimating) {
      if (withAnimation) {
        setIsAnimating(true);
        setSlideDirection('left');
        // Phase 1: Current card exits to the left
        setSlidePhase('exit');
        setTimeout(() => {
          // Change to next card and prepare to enter from right
          setCurrentIndex(prev => prev + 1);
          setIsFlipped(false);
          // Phase 2: New card enters from the right
          setSlidePhase('enter');
          // Wait a frame then animate to center
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
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
      }
    }
  };

  const handlePrev = (withAnimation = false) => {
    if (currentIndex > 0 && !isAnimating) {
      if (withAnimation) {
        setIsAnimating(true);
        setSlideDirection('right');
        // Phase 1: Current card exits to the right
        setSlidePhase('exit');
        setTimeout(() => {
          // Change to prev card and prepare to enter from left
          setCurrentIndex(prev => prev - 1);
          setIsFlipped(false);
          // Phase 2: New card enters from the left
          setSlidePhase('enter');
          // Wait a frame then animate to center
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
        setCurrentIndex(prev => prev - 1);
        setIsFlipped(false);
      }
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

    // Only swipe if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (isAnimating) return;

    const threshold = 80;

    if (swipeX < -threshold && currentIndex < words.length - 1) {
      // Swipe left - next
      handleNext(true);
    } else if (swipeX > threshold && currentIndex > 0) {
      // Swipe right - prev
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
    // Save new shuffled order with index 0
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
          router.push(`/project/${projectId}`);
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

    // Remove word from state
    const newWords = words.filter((_, i) => i !== currentIndex);

    if (newWords.length === 0) {
      // No more words, go back to project page
      router.push(`/project/${projectId}`);
      return;
    }

    // Adjust index if we deleted the last word
    if (currentIndex >= newWords.length) {
      setCurrentIndex(newWords.length - 1);
    }

    setWords(newWords);
    setIsFlipped(false);
  };

  // Calculate card transform
  const getCardTransform = () => {
    // Exit phase: card moves out in the swipe direction
    if (slidePhase === 'exit') {
      if (slideDirection === 'left') {
        return 'translateX(-120%)';
      }
      if (slideDirection === 'right') {
        return 'translateX(120%)';
      }
    }
    // Enter phase: card starts from opposite side and moves to center
    if (slidePhase === 'enter') {
      // Left swipe = next card = enters from right
      if (slideDirection === 'left') {
        return 'translateX(120%)';
      }
      // Right swipe = prev card = enters from left
      if (slideDirection === 'right') {
        return 'translateX(-120%)';
      }
    }
    // Normal swipe tracking
    if (swipeX !== 0) {
      return `translateX(${swipeX}px) rotate(${swipeX * 0.02}deg)`;
    }
    return 'translateX(0)';
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 overflow-hidden">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">フラッシュカードを準備中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
      {/* Header */}
      <header className="p-4 flex items-center justify-between">
        <button
          onClick={() => router.push(`/project/${projectId}`)}
          className="p-2 hover:bg-white/50 rounded-full transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2">
          {favoritesOnly && (
            <div className="flex items-center gap-1 bg-orange-100 px-2 py-1 rounded-full mr-2">
              <Flag className="w-3 h-3 fill-orange-500 text-orange-500" />
              <span className="text-xs font-medium text-orange-700">苦手</span>
            </div>
          )}
          <span className="text-sm text-gray-500">
            {currentIndex + 1} / {words.length}
          </span>
        </div>

        <button
          onClick={handleShuffle}
          className="p-2 hover:bg-white/50 rounded-full transition-colors"
          title="シャッフル"
        >
          <RotateCcw className="w-5 h-5 text-gray-600" />
        </button>
      </header>

      {/* Card area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 touch-pan-y">
        {/* Flashcard */}
        <div
          onClick={handleFlip}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full max-w-sm aspect-[3/4] cursor-pointer perspective-1000"
          style={{
            transform: getCardTransform(),
            transition: slidePhase === 'enter' ? 'none' : (isAnimating || swipeX === 0 ? 'transform 0.2s ease-out' : 'none'),
          }}
        >
          <div
            className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${
              isFlipped ? 'rotate-y-180' : ''
            }`}
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Front (English) */}
            <div
              className="absolute inset-0 bg-white rounded-3xl shadow-xl p-8 flex flex-col items-center justify-center backface-hidden"
              style={{ backfaceVisibility: 'hidden' }}
            >
              {/* Voice button above the word */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (currentWord?.english && typeof window !== 'undefined') {
                    const utterance = new SpeechSynthesisUtterance(currentWord.english);
                    utterance.lang = 'en-US';
                    utterance.rate = 0.9;
                    window.speechSynthesis.speak(utterance);
                  }
                }}
                className="p-3 hover:bg-gray-100 rounded-full transition-colors mb-4"
                aria-label="発音を聞く"
              >
                <Volume2 className="w-6 h-6 text-gray-400" />
              </button>
              <p className="text-3xl font-bold text-gray-900 text-center">
                {currentWord?.english}
              </p>
              <div className="absolute bottom-6 flex items-center gap-2 text-gray-400">
                <Eye className="w-4 h-4" />
                <span className="text-sm">タップで意味を見る</span>
              </div>
            </div>

            {/* Back (Japanese) */}
            <div
              className="absolute inset-0 bg-blue-600 rounded-3xl shadow-xl p-8 flex flex-col items-center justify-center"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <p className="text-2xl font-bold text-white text-center mb-4">
                {currentWord?.japanese}
              </p>
              <div className="absolute bottom-6 flex items-center gap-2 text-white/60">
                <EyeOff className="w-4 h-4" />
                <span className="text-sm">タップで戻る</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleToggleFavorite}
            className="p-3 rounded-full hover:bg-gray-100 transition-colors"
            aria-label={currentWord?.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Flag
              className={`w-6 h-6 transition-colors ${
                currentWord?.isFavorite
                  ? 'fill-orange-500 text-orange-500'
                  : 'text-gray-400'
              }`}
            />
          </button>
          <button
            onClick={handleDeleteWord}
            className="p-3 rounded-full hover:bg-red-50 transition-colors"
            aria-label="この単語を削除"
          >
            <Trash2 className="w-6 h-6 text-gray-400 hover:text-red-500 transition-colors" />
          </button>
        </div>
      </main>

      {/* Navigation */}
      <div className="p-6 flex items-center justify-center gap-8">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => handlePrev(true)}
          disabled={currentIndex === 0 || isAnimating}
          className="rounded-full w-14 h-14 p-0"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        {/* Flip button - PC only (hidden on mobile) */}
        <Button
          variant="secondary"
          size="lg"
          onClick={handleFlip}
          disabled={isAnimating}
          className="hidden md:flex rounded-full w-14 h-14 p-0"
          title="カードを回転"
        >
          <RefreshCw className="w-5 h-5" />
        </Button>

        <Button
          variant="secondary"
          size="lg"
          onClick={() => handleNext(true)}
          disabled={currentIndex === words.length - 1 || isAnimating}
          className="rounded-full w-14 h-14 p-0"
        >
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
