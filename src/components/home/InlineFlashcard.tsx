'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { shuffleArray } from '@/lib/utils';
import type { Word } from '@/types';

interface InlineFlashcardProps {
  words: Word[];
}

export function InlineFlashcard({ words }: InlineFlashcardProps) {
  const [shuffledWords, setShuffledWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Shuffle words on mount or when words change
  const reshuffleWords = useCallback(() => {
    if (words.length > 0) {
      setShuffledWords(shuffleArray([...words]));
      setCurrentIndex(0);
      setIsFlipped(false);
    }
  }, [words]);

  useEffect(() => {
    reshuffleWords();
  }, [reshuffleWords]);

  const currentWord = shuffledWords[currentIndex];

  // Text-to-speech
  const speakWord = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentWord?.english && typeof window !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(currentWord.english);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Navigation
  const goToPrevious = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  };

  const goToNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      // Loop back to beginning with reshuffle
      reshuffleWords();
    }
  };

  if (words.length === 0 || !currentWord) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[var(--color-muted)]">単語を追加して学習を始めましょう</p>
      </div>
    );
  }

  return (
    <div className="card p-4 bg-[var(--color-primary-light)]">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[var(--color-muted)]">
          {currentIndex + 1} / {shuffledWords.length}
        </span>
        <button
          onClick={reshuffleWords}
          className="p-1.5 hover:bg-[var(--color-primary)]/10 rounded-full transition-colors"
          aria-label="シャッフル"
        >
          <Icon name="refresh" size={16} className="text-[var(--color-muted)]" />
        </button>
      </div>

      {/* Flashcard */}
      <div
        className="bg-[var(--color-surface)] rounded-2xl min-h-[160px] shadow-soft mb-4 relative cursor-pointer select-none"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const width = rect.width;
          const third = width / 3;

          if (x < third) {
            goToPrevious();
          } else if (x > third * 2) {
            goToNext();
          } else {
            setIsFlipped(prev => !prev);
          }
        }}
      >
        <div className="p-6 flex items-center justify-center min-h-[160px]">
          {!isFlipped ? (
            // Front: English
            <div className="text-center">
              <div className="flex items-center justify-center mb-2 h-[20px]">
                <button
                  onClick={speakWord}
                  className="p-1 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
                  aria-label="発音を聞く"
                >
                  <Icon name="volume_up" size={20} className="text-[var(--color-muted)]" />
                </button>
              </div>
              <h2 className="text-3xl font-bold text-[var(--color-foreground)] tracking-tight">
                {currentWord.english}
              </h2>
              <p className="text-sm text-[var(--color-muted)] mt-3">タップして意味を表示</p>
            </div>
          ) : (
            // Back: Japanese
            <div className="text-center">
              <p className="text-sm text-[var(--color-muted)] mb-2 h-[20px] flex items-center justify-center">{currentWord.english}</p>
              <h2 className="text-2xl font-bold text-[var(--color-foreground)]">
                {currentWord.japanese}
              </h2>
              <p className="text-sm text-[var(--color-muted)] mt-3">タップして英語を表示</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
