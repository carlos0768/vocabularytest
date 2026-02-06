'use client';

import { Loader2, X } from 'lucide-react';
import { InlineFlashcard } from '@/components/home/InlineFlashcard';
import type { Word } from '@/types';

interface LoadingScreenProps {
  words?: Word[];
  onCancel?: () => void;
}

export function LoadingScreen({ words, onCancel }: LoadingScreenProps) {
  // If words are provided, show flashcard during loading
  if (words && words.length > 0) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        {/* Header with close button */}
        <header className="flex-shrink-0 p-4 flex items-center justify-between">
          {onCancel ? (
            <button
              onClick={onCancel}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
              aria-label="キャンセル"
            >
              <X className="w-6 h-6" />
            </button>
          ) : (
            <div className="w-10" />
          )}
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-[var(--color-primary)] animate-spin" />
            <span className="text-sm font-medium text-[var(--color-foreground)]">生成中...</span>
          </div>
          <div className="w-10" />
        </header>

        {/* Loading message */}
        <div className="px-6 pb-4">
          <p className="text-sm text-[var(--color-muted)] text-center">
            フラッシュカードで復習しながらお待ちください
          </p>
        </div>

        {/* Flashcard */}
        <main className="flex-1 px-6 pb-6 overflow-y-auto">
          <InlineFlashcard words={words} />
        </main>
      </div>
    );
  }

  // Default spinner with cancel button
  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
      {onCancel && (
        <header className="flex-shrink-0 p-4">
          <button
            onClick={onCancel}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
            aria-label="キャンセル"
          >
            <X className="w-6 h-6" />
          </button>
        </header>
      )}
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[var(--color-primary)] animate-spin" />
      </div>
    </div>
  );
}
