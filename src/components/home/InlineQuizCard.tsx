'use client';

import { useState, useEffect, useCallback } from 'react';
import { Zap, Volume2, ChevronRight } from 'lucide-react';
import { shuffleArray } from '@/lib/utils';
import type { Word } from '@/types';

interface QuizQuestion {
  word: Word;
  options: string[];
  correctIndex: number;
}

interface InlineQuizCardProps {
  words: Word[];
  onComplete?: () => void;
}

export function InlineQuizCard({ words, onComplete }: InlineQuizCardProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  // Generate quiz questions
  const generateQuestions = useCallback((wordList: Word[]): QuizQuestion[] => {
    const selected = shuffleArray(wordList).slice(0, 10);

    return selected.map((word) => {
      const allOptions = [word.japanese, ...word.distractors];
      const shuffled = shuffleArray(allOptions);
      const correctIndex = shuffled.indexOf(word.japanese);

      return {
        word,
        options: shuffled,
        correctIndex,
      };
    });
  }, []);

  // Initialize questions
  useEffect(() => {
    if (words.length > 0) {
      setQuestions(generateQuestions(words));
    }
  }, [words, generateQuestions]);

  const currentQuestion = questions[currentIndex];
  const remainingCount = questions.length - currentIndex;

  // Handle option selection
  const handleSelect = (index: number) => {
    if (isRevealed || selectedIndex !== null) return;

    setSelectedIndex(index);
    setIsRevealed(true);
  };

  // Move to next question
  const moveToNext = () => {
    if (currentIndex + 1 >= questions.length) {
      // Reset and regenerate
      setQuestions(generateQuestions(words));
      setCurrentIndex(0);
      setSelectedIndex(null);
      setIsRevealed(false);
      onComplete?.();
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedIndex(null);
      setIsRevealed(false);
    }
  };

  // Text-to-speech
  const speakWord = () => {
    if (currentQuestion?.word.english && typeof window !== 'undefined') {
      const utterance = new SpeechSynthesisUtterance(currentQuestion.word.english);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (words.length === 0 || !currentQuestion) {
    return (
      <div className="bg-gray-100 rounded-3xl p-8 text-center">
        <p className="text-gray-500">単語を追加してクイズを始めましょう</p>
      </div>
    );
  }

  const isCorrect = selectedIndex === currentQuestion.correctIndex;

  return (
    <div className="bg-gray-100 rounded-3xl p-4 relative">
      {/* Badge */}
      <div className="flex items-center gap-1 mb-4">
        <div className="flex items-center gap-1 bg-gradient-to-r from-orange-400 to-pink-500 text-white px-3 py-1 rounded-full text-sm font-medium">
          <Zap className="w-4 h-4" />
          <span>{remainingCount}</span>
        </div>
      </div>

      {/* Word display */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-3xl font-bold text-gray-900">
            {currentQuestion.word.english}
          </h2>
          <button
            onClick={speakWord}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
            aria-label="発音を聞く"
          >
            <Volume2 className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Options - 2x2 grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {currentQuestion.options.map((option, index) => {
          let bgColor = 'bg-white hover:bg-gray-50';
          let textColor = 'text-gray-900';
          let borderColor = 'border-transparent';

          if (isRevealed) {
            if (index === currentQuestion.correctIndex) {
              bgColor = 'bg-emerald-100';
              textColor = 'text-emerald-800';
              borderColor = 'border-emerald-300';
            } else if (index === selectedIndex && !isCorrect) {
              bgColor = 'bg-red-100';
              textColor = 'text-red-800';
              borderColor = 'border-red-300';
            } else {
              bgColor = 'bg-gray-50';
              textColor = 'text-gray-400';
            }
          }

          return (
            <button
              key={index}
              onClick={() => handleSelect(index)}
              disabled={isRevealed}
              className={`p-4 rounded-xl border-2 ${borderColor} ${bgColor} ${textColor} font-medium text-center transition-all disabled:cursor-default`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Next button */}
      {isRevealed && (
        <button
          onClick={moveToNext}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          次へ
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
