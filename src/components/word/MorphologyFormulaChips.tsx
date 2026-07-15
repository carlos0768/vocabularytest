import type { WordMorphology } from '@/types';

/**
 * 語源式（un(否定) ＋ anim(心) ＋ ous(形容詞化)）をピル表示する。
 * モバイルの単語詳細とデスクトップの単語詳細モーダルで共用。
 * 表示可否は呼び出し側で hasDisplayableMorphology() により判定すること。
 */
export function MorphologyFormulaChips({ morphology }: { morphology: WordMorphology }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {morphology.formula.map((part, index) => (
        <span key={`${part.text}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && (
            <span className="text-[14px] font-bold text-[var(--color-muted)]">＋</span>
          )}
          <span
            className={`rounded-full border-2 px-2.5 py-1 font-display text-[13px] font-bold leading-none ${
              part.kind === 'root'
                ? 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]'
                : 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-ink)]'
            }`}
          >
            {part.text}
            <span className="ml-1 text-[11px] font-semibold opacity-80">({part.meaningJa})</span>
          </span>
        </span>
      ))}
    </div>
  );
}
