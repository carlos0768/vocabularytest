'use client';

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getWeakWordsRanking } from '@/lib/stats';

export function WeakWordsRanking() {
  const weakWords = useMemo(() => getWeakWordsRanking(10), []);

  if (weakWords.length === 0) {
    return (
      <div className="card p-5">
        <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[var(--color-error)]" />
          苦手単語ランキング
        </h2>
        <div className="flex items-center justify-center py-8 text-[var(--color-muted)] text-sm">
          間違えた単語がまだありません
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-[var(--color-error)]" />
        苦手単語ランキング
      </h2>

      <div className="space-y-2">
        {weakWords.map((word, index) => (
          <div
            key={word.wordId}
            className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border-light)]"
          >
            {/* Rank */}
            <span className={`text-sm font-bold w-6 text-center flex-shrink-0 ${
              index < 3 ? 'text-[var(--color-error)]' : 'text-[var(--color-muted)]'
            }`}>
              {index + 1}
            </span>

            {/* Word info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--color-foreground)] text-sm truncate">
                {word.english}
              </p>
              <p className="text-xs text-[var(--color-muted)] truncate">
                {word.japanese}
              </p>
            </div>

            {/* Wrong count badge */}
            <div className="flex-shrink-0 bg-[var(--color-error-light)] text-[var(--color-error)] text-xs font-bold px-2 py-1 rounded-full">
              {word.wrongCount}回
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
