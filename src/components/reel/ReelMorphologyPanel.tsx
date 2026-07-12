'use client';

import type { ReelItem } from '@/lib/reels/types';

/** 3面目: 語源（接頭語・接尾語・接中語・語根）の分解と解説。 */
export function ReelMorphologyPanel({ item }: { item: ReelItem }) {
  const morphology = item.morphology;
  if (!morphology || morphology.none || morphology.formula.length === 0) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-8 text-center">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        語源
      </p>
      <p className="font-display text-2xl font-bold text-[var(--color-foreground)]">
        {item.english}
      </p>

      {/* 式: un(否定) ＋ anim(心) ＋ ous(形容詞化) */}
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
        {morphology.formula.map((part, index) => (
          <span key={`${part.text}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && (
              <span className="text-base font-bold text-[var(--color-muted)]">＋</span>
            )}
            <span
              className={`rounded-full border px-3 py-1 text-sm font-bold ${
                part.kind === 'root'
                  ? 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-foreground)]'
                  : 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-ink)]'
              }`}
            >
              {part.text}
              <span className="ml-1 text-xs font-semibold opacity-80">({part.meaningJa})</span>
            </span>
          </span>
        ))}
      </div>

      {/* ニュアンス解説（最大2行） */}
      <p className="max-w-md whitespace-pre-line text-base leading-relaxed text-[var(--color-secondary-text)]">
        {morphology.explanation}
      </p>
    </div>
  );
}
