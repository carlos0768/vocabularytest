'use client';

import type { ReelItem } from '@/lib/reels/types';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';

/**
 * 語源解析つきカードの統合面。英単語・訳・語源の三つを1ページにまとめて表示する。
 * 語源がある単語はめくり（左右スワイプ）無しでこの1面のみを表示する（ReelCard 参照）。
 */
export function ReelEtymologyPanel({ item }: { item: ReelItem }) {
  const morphology = item.morphology;
  const hasMorphology = Boolean(
    morphology && !morphology.none && morphology.formula.length > 0,
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-8 text-center">
      {item.partOfSpeechTags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {item.partOfSpeechTags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-secondary-text)]"
            >
              {getPartOfSpeechLabel(tag)}
            </span>
          ))}
        </div>
      )}

      {/* 英単語 + 発音 */}
      <div className="flex flex-col items-center gap-1">
        <p className="font-display text-3xl font-bold text-[var(--color-foreground)]">
          {item.english}
        </p>
        {item.pronunciation && (
          <p className="font-mono text-base text-[var(--color-secondary-text)]">
            {item.pronunciation}
          </p>
        )}
      </div>

      {/* 訳 */}
      <div className="text-2xl font-bold leading-snug text-[var(--color-foreground)]">
        <TranslationDisplay
          word={{ japanese: item.japanese, translations: item.translations }}
        />
      </div>

      {/* 語源: un(否定) ＋ anim(心) ＋ ous(形容詞化) + ニュアンス解説 */}
      {hasMorphology && morphology && (
        <div className="flex w-full max-w-md flex-col items-center gap-3 border-t border-[var(--color-border)] pt-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            語源
          </p>
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
          <p className="whitespace-pre-line text-base leading-relaxed text-[var(--color-secondary-text)]">
            {morphology.explanation}
          </p>
        </div>
      )}
    </div>
  );
}
