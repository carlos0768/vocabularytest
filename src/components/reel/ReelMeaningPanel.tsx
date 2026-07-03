'use client';

import type { ReelItem } from '@/lib/reels/types';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';

/** Japanese face of a reel card: meaning + example sentences. */
export function ReelMeaningPanel({ item }: { item: ReelItem }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-8 text-center">
      <p className="font-display text-2xl font-bold text-[var(--color-foreground)]">
        {item.english}
      </p>
      <div className="text-3xl font-bold leading-snug text-[var(--color-foreground)]">
        <TranslationDisplay
          word={{ japanese: item.japanese, translations: item.translations }}
        />
      </div>
      {item.exampleSentence && (
        <div className="mt-2 max-w-md space-y-1.5">
          <p className="text-base leading-relaxed text-[var(--color-foreground)]">
            {item.exampleSentence}
          </p>
          {item.exampleSentenceJa && (
            <p className="text-sm leading-relaxed text-[var(--color-secondary-text)]">
              {item.exampleSentenceJa}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
