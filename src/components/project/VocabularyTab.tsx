'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Word, WordRepository } from '@/types';

interface VocabularyTabProps {
  words: Word[];
  repository: WordRepository;
  onWordsUpdate: (updater: (prev: Word[]) => Word[]) => void;
}

export function VocabularyTab({ words, repository, onWordsUpdate }: VocabularyTabProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Swipe state
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [slidePhase, setSlidePhase] = useState<'exit' | 'enter' | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const currentWord = words[currentIndex];

  // Ensure currentIndex is valid when words change
  useEffect(() => {
    if (currentIndex >= words.length && words.length > 0) {
      setCurrentIndex(words.length - 1);
    }
  }, [words.length, currentIndex]);

  // Navigation
  const handleNext = useCallback((withAnimation = false) => {
    if (isAnimating || words.length === 0) return;
    const nextIndex = currentIndex < words.length - 1 ? currentIndex + 1 : 0;

    if (withAnimation) {
      setIsAnimating(true);
      setSlideDirection('left');
      setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(nextIndex);
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
    }
  }, [isAnimating, currentIndex, words.length]);

  const handlePrev = useCallback((withAnimation = false) => {
    if (isAnimating || words.length === 0) return;
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : words.length - 1;

    if (withAnimation) {
      setIsAnimating(true);
      setSlideDirection('right');
      setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(prevIndex);
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
    }
  }, [isAnimating, currentIndex, words.length]);

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

  // Keyboard navigation
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnimating, handleNext, handlePrev]);

  // Speech synthesis
  const speakWord = () => {
    if (currentWord?.english && typeof window !== 'undefined') {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentWord.english);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Dictionary link
  const handleOpenDictionary = () => {
    if (currentWord?.english) {
      const encoded = encodeURIComponent(currentWord.english);
      window.open(`https://eow.alc.co.jp/search?q=${encoded}`, '_blank');
    }
  };

  // Favorite toggle
  const handleToggleFavorite = async () => {
    if (!currentWord) return;
    const newFavorite = !currentWord.isFavorite;
    await repository.updateWord(currentWord.id, { isFavorite: newFavorite });
    onWordsUpdate((prev) =>
      prev.map((w) => (w.id === currentWord.id ? { ...w, isFavorite: newFavorite } : w))
    );
  };

  // Card transform for swipe animation
  const getCardTransform = () => {
    if (slidePhase === 'exit') {
      return slideDirection === 'left' ? 'translateX(-120%)' : 'translateX(120%)';
    }
    if (slidePhase === 'enter') {
      return slideDirection === 'left' ? 'translateX(120%)' : 'translateX(-120%)';
    }
    if (swipeX !== 0) {
      return `translateX(${swipeX}px) rotate(${swipeX * 0.02}deg)`;
    }
    return 'translateX(0)';
  };

  if (words.length === 0) {
    return (
      <div className="text-center py-16">
        <Icon name="menu_book" size={48} className="text-[var(--color-muted)] mx-auto mb-4" />
        <p className="text-[var(--color-muted)] text-sm">単語がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Card area */}
      <div
        className="relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="transition-transform duration-200 ease-out"
          style={{
            transform: getCardTransform(),
            transition: slidePhase === 'exit' ? 'transform 200ms ease-out' : slidePhase === 'enter' ? 'none' : swipeX !== 0 ? 'none' : 'transform 200ms ease-out',
          }}
        >
          {currentWord && (
            <div className="card border-2 border-[var(--color-border)] border-b-4 overflow-hidden">
              {/* Top bar: progress + actions */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-xs font-bold text-[var(--color-muted)]">
                  {currentIndex + 1}/{words.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={speakWord}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--color-surface)] transition-colors text-[var(--color-muted)]"
                    aria-label="発音を聞く"
                  >
                    <Icon name="volume_up" size={18} />
                  </button>
                  <button
                    onClick={handleToggleFavorite}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--color-surface)] transition-colors"
                    aria-label="苦手マーク"
                  >
                    <Icon
                      name="flag"
                      size={18}
                      filled={currentWord.isFavorite}
                      className={currentWord.isFavorite ? 'text-[var(--color-error)]' : 'text-[var(--color-muted)]'}
                    />
                  </button>
                </div>
              </div>

              {/* Main content */}
              <div className="px-5 pb-5 space-y-4">
                {/* English word */}
                <div className="text-center py-3">
                  <h2 className="text-3xl font-bold text-[var(--color-foreground)] tracking-tight">
                    {currentWord.english}
                  </h2>
                </div>

                {/* Japanese translation */}
                <div className="text-center">
                  <p className="text-lg font-semibold text-[var(--color-foreground)]">{currentWord.japanese}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => handlePrev(true)}
          disabled={isAnimating}
          className="w-12 h-12 rounded-full border-2 border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
          aria-label="前の単語"
        >
          <Icon name="chevron_left" size={24} className="text-[var(--color-foreground)]" />
        </button>

        <button
          onClick={handleOpenDictionary}
          className="px-5 py-2.5 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]"
          aria-label="辞書で調べる"
        >
          <Icon name="menu_book" size={18} />
          辞書
        </button>

        <button
          onClick={() => handleNext(true)}
          disabled={isAnimating}
          className="w-12 h-12 rounded-full border-2 border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
          aria-label="次の単語"
        >
          <Icon name="chevron_right" size={24} className="text-[var(--color-foreground)]" />
        </button>
      </div>
    </div>
  );
}
