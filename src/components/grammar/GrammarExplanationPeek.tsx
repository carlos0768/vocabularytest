'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GrammarPattern } from '@/types';

interface GrammarExplanationPeekProps {
  pattern: GrammarPattern;
}

export function GrammarExplanationPeek({ pattern }: GrammarExplanationPeekProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mx-5 mb-3">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)] py-1"
      >
        <Icon
          name="expand_more"
          size={16}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
        解説を見る
      </button>

      {isOpen && (
        <div className="mt-2 bg-[var(--color-surface-secondary)] rounded-xl px-4 py-3 space-y-2 animate-fade-in">
          <p className="text-sm font-bold text-[var(--color-foreground)]">{pattern.patternName}</p>
          <div className="bg-[var(--color-surface)] rounded-lg px-3 py-2">
            <p className="text-xs font-mono text-[var(--color-foreground)]">{pattern.structure}</p>
          </div>
          <p className="text-xs text-[var(--color-muted)] leading-relaxed">{pattern.explanation}</p>
          <div className="border-l-2 border-[var(--color-primary)] pl-3">
            <p className="text-xs italic text-[var(--color-foreground)]">{pattern.example}</p>
            <p className="text-xs text-[var(--color-muted)]">{pattern.exampleJa}</p>
          </div>
        </div>
      )}
    </div>
  );
}
