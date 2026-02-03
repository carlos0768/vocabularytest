'use client';

import { Loader2 } from 'lucide-react';
import { InlineFlashcard } from '@/components/home/InlineFlashcard';
import type { Word } from '@/types';

interface LoadingScreenProps {
  words?: Word[];
}

export function LoadingScreen({ words }: LoadingScreenProps) {
  // If words are provided, show flashcard during loading
  if (words && words.length > 0) {
    return (
      <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0">
        {/* Loading indicator */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin flex-shrink-0" />
            <p className="text-[var(--color-foreground)] font-semibold">クイズを生成中...</p>
          </div>
          <p className="text-sm text-[var(--color-muted)]">
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

  // Default spinner
  return (
    <div className="h-screen flex items-center justify-center bg-[var(--color-background)] overflow-hidden">
      <Loader2 className="w-12 h-12 text-[var(--color-primary)] animate-spin" />
    </div>
  );
}
