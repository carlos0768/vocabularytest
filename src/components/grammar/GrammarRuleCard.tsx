'use client';

import { Icon } from '@/components/ui/Icon';
import type { GrammarPattern } from '@/types';

interface GrammarRuleCardProps {
  pattern: GrammarPattern;
  onStartQuiz: () => void;
}

export function GrammarRuleCard({ pattern, onStartQuiz }: GrammarRuleCardProps) {
  const levelLabel = pattern.level === '1' ? '1級' : '準1級';
  const levelColor = pattern.level === '1' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex-1 px-5 py-6 overflow-y-auto">
        {/* Pattern name + level */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${levelColor}`}>
            {levelLabel}
          </span>
        </div>
        <h2 className="text-2xl font-black text-[var(--color-foreground)] mb-1">
          {pattern.patternName}
        </h2>
        <p className="text-sm text-[var(--color-muted)] mb-6">{pattern.patternNameEn}</p>

        {/* Structure formula */}
        <div className="bg-[var(--color-surface-secondary)] rounded-2xl px-5 py-4 mb-6">
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-1">構造</p>
          <p className="text-base font-mono font-bold text-[var(--color-foreground)]">
            {pattern.structure}
          </p>
        </div>

        {/* Explanation */}
        <div className="mb-6">
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-2">解説</p>
          <p className="text-sm text-[var(--color-foreground)] leading-relaxed">
            {pattern.explanation}
          </p>
        </div>

        {/* Example sentence */}
        <div className="border-l-3 border-[var(--color-primary)] pl-4 py-2">
          <p className="text-xs font-semibold text-[var(--color-muted)] mb-1">例文</p>
          <p className="text-base text-[var(--color-foreground)] font-semibold italic mb-1">
            {pattern.example}
          </p>
          <p className="text-sm text-[var(--color-muted)]">
            {pattern.exampleJa}
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="px-5 py-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={onStartQuiz}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[var(--color-foreground)] text-white font-bold text-base active:scale-[0.98] transition-transform"
        >
          問題を解く
          <Icon name="arrow_forward" size={20} />
        </button>
      </div>
    </div>
  );
}
