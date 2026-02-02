'use client';

import { useMemo } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { getWeakWordsRanking } from '@/lib/stats';
import { removeWrongAnswer } from '@/lib/utils';

export function WeakWordsRanking() {
  const weakWords = useMemo(() => getWeakWordsRanking(10), []);

  const handleRemove = (wordId: string) => {
    removeWrongAnswer(wordId);
    // Force reload to update the list
    window.location.reload();
  };

  if (weakWords.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-[var(--color-primary)]" />
          <h3 className="font-bold text-[var(--color-foreground)]">苦手単語ランキング</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-[var(--color-muted)]">🎉 苦手な単語はありません！</p>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            間違えた単語がここに表示されます
          </p>
        </div>
      </div>
    );
  }

  const maxWrong = Math.max(...weakWords.map(w => w.wrongCount));

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-[var(--color-primary)]" />
        <h3 className="font-bold text-[var(--color-foreground)]">苦手単語ランキング</h3>
        <span className="ml-auto text-sm text-[var(--color-muted)]">
          トップ{weakWords.length}
        </span>
      </div>

      <div className="space-y-3">
        {weakWords.map((word, index) => {
          const intensity = word.wrongCount / maxWrong;
          const barColor = intensity > 0.7 
            ? 'bg-[var(--color-error)]' 
            : intensity > 0.4 
              ? 'bg-[var(--color-primary)]' 
              : 'bg-[var(--color-peach)]';

          return (
            <div
              key={word.wordId}
              className="group relative p-3 bg-[var(--color-surface)] rounded-xl hover:bg-[var(--color-peach-light)] transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Rank */}
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                  index === 0 ? 'bg-[var(--color-error)] text-white' :
                  index === 1 ? 'bg-[var(--color-primary)] text-white' :
                  index === 2 ? 'bg-[var(--color-peach)] text-white' :
                  'bg-[var(--color-border)] text-[var(--color-muted)]'
                }`}>
                  {index + 1}
                </span>

                {/* Word */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[var(--color-foreground)] truncate">
                    {word.english}
                  </p>
                  <p className="text-sm text-[var(--color-muted)] truncate">
                    {word.japanese}
                  </p>
                </div>

                {/* Wrong Count */}
                <div className="text-right">
                  <p className="text-lg font-bold text-[var(--color-primary)]">
                    {word.wrongCount}回
                  </p>
                  <div className="w-16 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${barColor} transition-all`}
                      style={{ width: `${intensity * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Remove button */}
              <button
                onClick={() => handleRemove(word.wordId)}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-[var(--color-muted)] hover:text-[var(--color-error)] transition-all"
                title="リストから削除"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--color-muted)] mt-4 text-center">
        タップして単語詳細へ / ホバーして削除
      </p>
    </div>
  );
}
