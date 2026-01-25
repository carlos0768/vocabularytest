'use client';

import { useState, useEffect, useCallback } from 'react';
import { Volume2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
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
      <div className="bg-gray-100 rounded-3xl p-8 text-center">
        <p className="text-gray-500">単語を追加して学習を始めましょう</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 rounded-3xl p-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          {currentIndex + 1} / {shuffledWords.length}
        </span>
        <button
          onClick={reshuffleWords}
          className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"
          aria-label="シャッフル"
        >
          <RotateCcw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Flashcard */}
      <div className="bg-white rounded-2xl p-6 min-h-[160px] flex items-center justify-center shadow-sm mb-4 relative">
        {/* Left arrow button */}
        <button
          onClick={goToPrevious}
          disabled={currentIndex === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="前へ"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>

        {/* Card content - tap to flip */}
        <div
          onClick={() => setIsFlipped(prev => !prev)}
          className="flex-1 px-10 cursor-pointer"
        >
          {!isFlipped ? (
            // Front: English
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900">
                {currentWord.english}
              </h2>
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={speakWord}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="発音を聞く"
                >
                  <Volume2 className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <p className="text-sm text-gray-400 mt-2">タップして意味を表示</p>
            </div>
          ) : (
            // Back: Japanese
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">{currentWord.english}</p>
              <h2 className="text-2xl font-bold text-gray-900">
                {currentWord.japanese}
              </h2>
              <p className="text-sm text-gray-400 mt-2">タップして英語を表示</p>
            </div>
          )}
        </div>

        {/* Right arrow button */}
        <button
          onClick={goToNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          aria-label="次へ"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
