'use client';

import { Icon } from '@/components/ui/Icon';
import type { GrammarPattern } from '@/types';

interface PatternResult {
  pattern: GrammarPattern;
  correct: number;
  total: number;
}

interface GrammarDrillResultProps {
  results: PatternResult[];
  onRetry: () => void;
  onHome: () => void;
}

export function GrammarDrillResult({ results, onRetry, onHome }: GrammarDrillResultProps) {
  const totalCorrect = results.reduce((sum, r) => sum + r.correct, 0);
  const totalQuestions = results.reduce((sum, r) => sum + r.total, 0);
  const scorePercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  const levelLabel = (level: string) => level === '1' ? '1級' : '準1級';

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex-1 px-5 py-8 overflow-y-auto">
        {/* Score */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-black text-[var(--color-primary)]">{scorePercent}%</span>
          </div>
          <p className="text-xl font-black text-[var(--color-foreground)]">
            {totalCorrect} / {totalQuestions} 正解
          </p>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            {scorePercent >= 80 ? 'すばらしい！' : scorePercent >= 50 ? 'もう少し！' : '復習しましょう'}
          </p>
        </div>

        {/* Per-pattern breakdown */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">パターン別結果</p>
          {results.map((result, index) => {
            const allCorrect = result.correct === result.total;
            return (
              <div key={index} className="flex items-center gap-3 py-2.5 border-b border-[var(--color-border-light)] last:border-0">
                <Icon
                  name={allCorrect ? 'check_circle' : 'cancel'}
                  size={20}
                  className={allCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}
                  filled
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">
                    {result.pattern.patternName}
                  </p>
                  <span className={`text-[10px] font-bold ${
                    result.pattern.level === '1' ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {levelLabel(result.pattern.level)}
                  </span>
                </div>
                <span className="text-sm font-bold text-[var(--color-muted)] tabular-nums">
                  {result.correct}/{result.total}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-5 py-4 space-y-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={onRetry}
          className="w-full py-3.5 rounded-xl bg-[var(--color-foreground)] text-white font-bold text-sm active:scale-[0.98] transition-transform"
        >
          もう一度
        </button>
        <button
          onClick={onHome}
          className="w-full py-3.5 rounded-xl border border-[var(--color-border)] text-[var(--color-foreground)] font-bold text-sm active:scale-[0.98] transition-transform"
        >
          ホームに戻る
        </button>
      </div>
    </div>
  );
}
