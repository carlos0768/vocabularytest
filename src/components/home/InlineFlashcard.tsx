'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { shuffleArray } from '@/lib/utils';
import type { Word } from '@/types';

interface InlineFlashcardProps {
  words: Word[];
}

type MasteryInfo = {
  level: number; // 0..3
  label: string;
  colorVar: string;
};

function getMasteryInfo(repetition: number): MasteryInfo {
  if (repetition === 0) {
    return { level: 0, label: '新規', colorVar: 'var(--color-muted)' };
  }
  if (repetition <= 2) {
    return { level: 1, label: '学習中', colorVar: '#f59e0b' };
  }
  if (repetition <= 5) {
    return { level: 2, label: '定着中', colorVar: 'var(--color-primary)' };
  }
  return { level: 3, label: 'マスター', colorVar: '#10b981' };
}

function HighlightedExample({ text, term }: { text: string; term: string }) {
  const segments = useMemo(() => {
    if (!term) return [{ text, highlight: false }];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part) => ({
      text: part,
      highlight: part.toLowerCase() === term.toLowerCase(),
    }));
  }, [text, term]);

  return (
    <p className="text-sm leading-relaxed text-white/90">
      {segments.map((seg, i) =>
        seg.highlight ? (
          <span key={i} className="font-bold text-white">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </p>
  );
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
      setCurrentIndex((prev) => prev - 1);
      setIsFlipped(false);
    }
  };

  const goToNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex((prev) => prev + 1);
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

  const mastery = getMasteryInfo(currentWord.repetition ?? 0);

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
        className="rounded-2xl min-h-[220px] shadow-soft mb-4 relative cursor-pointer select-none overflow-hidden"
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
            setIsFlipped((prev) => !prev);
          }
        }}
      >
        {!isFlipped ? (
          // Front: English + pronunciation + POS + mastery
          <div className="bg-[var(--color-surface)] p-6 flex flex-col items-center justify-center min-h-[220px]">
            {/* Mastery dots */}
            <div className="flex items-center gap-1 mb-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="block w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor:
                      i <= mastery.level ? mastery.colorVar : 'var(--color-border)',
                  }}
                />
              ))}
              <span
                className="ml-1.5 text-[10px] font-medium"
                style={{ color: mastery.colorVar }}
              >
                {mastery.label}
              </span>
            </div>

            <div className="flex items-center justify-center gap-2">
              <h2 className="text-3xl font-bold text-[var(--color-foreground)] tracking-tight">
                {currentWord.english}
              </h2>
              <button
                onClick={speakWord}
                className="p-1 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
                aria-label="発音を聞く"
              >
                <Icon name="volume_up" size={20} className="text-[var(--color-muted)]" />
              </button>
            </div>

            {/* Pronunciation */}
            {currentWord.pronunciation && (
              <p className="mt-2 font-mono text-sm text-[var(--color-muted)]">
                {currentWord.pronunciation}
              </p>
            )}

            {/* Part of speech tags */}
            {currentWord.partOfSpeechTags && currentWord.partOfSpeechTags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {currentWord.partOfSpeechTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-[var(--color-primary)]/12 text-[var(--color-primary)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs text-[var(--color-muted)] mt-4">タップして裏面を見る</p>
          </div>
        ) : (
          // Back: Japanese + example sentence + translation
          <div
            className="p-6 flex flex-col min-h-[220px] text-white"
            style={{
              background:
                'linear-gradient(135deg, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 85%, black) 100%)',
            }}
          >
            <div className="flex flex-col items-center text-center mb-4">
              <h2 className="text-2xl font-bold">{currentWord.japanese}</h2>
              <p className="mt-1 text-sm text-white/60">{currentWord.english}</p>
              {currentWord.pronunciation && (
                <p className="mt-0.5 font-mono text-xs text-white/50">
                  {currentWord.pronunciation}
                </p>
              )}
            </div>

            {/* Example sentence */}
            {currentWord.exampleSentence ? (
              <div className="rounded-xl bg-white/10 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-white/50 mb-2">
                  例文
                </p>
                <HighlightedExample
                  text={currentWord.exampleSentence}
                  term={currentWord.english}
                />
                {currentWord.exampleSentenceJa && (
                  <p className="mt-1.5 text-xs text-white/60 leading-relaxed">
                    {currentWord.exampleSentenceJa}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-white/10 p-3.5 text-center">
                <p className="text-xs text-white/60">例文はまだありません</p>
              </div>
            )}

            <p className="text-xs text-white/60 mt-auto pt-3 text-center">
              タップして英語を表示
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
