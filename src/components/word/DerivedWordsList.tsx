import type { WordDerivedWords } from '@/types';
import {
  DERIVED_WORD_POS_LABELS,
  formatExamTags,
} from '@/lib/derived-words/format';

/**
 * 派生語（reception(名) 受付 / TOEFL・私大 …）を一覧表示する。
 * モバイルの単語詳細とデスクトップの単語詳細モーダルで共用。
 * 表示可否は呼び出し側で hasDisplayableDerivedWords() により判定すること。
 */
export function DerivedWordsList({ derivedWords }: { derivedWords: WordDerivedWords }) {
  return (
    <div className="space-y-2.5">
      {derivedWords.items.map((item, index) => {
        const examLabels = formatExamTags(item.examTags);
        return (
          <div
            key={`${item.english}-${index}`}
            className="rounded-r-[10px] border-l-[3px] border-[var(--color-accent)] bg-[var(--color-surface-alt)] px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-display text-[15px] font-black leading-snug text-[var(--solid-ink)]">
                {item.english}
              </span>
              <span className="rounded-full border border-[var(--color-border)] bg-white px-1.5 py-0.5 text-[10px] font-bold leading-none text-[var(--color-ink-muted)]">
                {DERIVED_WORD_POS_LABELS[item.partOfSpeech] ?? item.partOfSpeech}
              </span>
            </div>
            <div className="mt-1.5 text-[13px] leading-snug text-[var(--solid-ink)]">
              {item.japanese}
            </div>
            {examLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {examLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[10px] font-bold leading-none text-[var(--color-ink-muted)]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
