'use client';

import { Icon } from '@/components/ui/Icon';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { hasFeature, type FeatureKey, type WordListEntry } from '@/lib/words/word-filter';
import type { WordStatus } from '@/types';

const STATUS_STYLE: Record<WordStatus, { label: string; fg: string; bg: string; border: string }> = {
  new: { label: '未学習', fg: 'var(--color-muted)', bg: '#fff', border: 'var(--color-border)' },
  review: { label: '学習中', fg: '#137fec', bg: 'rgba(19,127,236,0.1)', border: '#137fec' },
  active: { label: '定着中', fg: '#2563eb', bg: 'rgba(37,99,235,0.1)', border: '#2563eb' },
  mastered: { label: '習得', fg: 'var(--color-success)', bg: 'rgba(61,122,78,0.12)', border: 'var(--color-success)' },
};

/** 行の下段に出す小さな要素マーク。フィルタの結果を目で確認できるようにする。 */
const FEATURE_MARKS: Array<{ key: FeatureKey; mark: string }> = [
  { key: 'example', mark: '例文' },
  { key: 'pronunciation', mark: '発音' },
  { key: 'morphology', mark: '語源' },
  { key: 'derived', mark: '派生' },
  { key: 'multiMeaning', mark: '多義' },
  { key: 'custom', mark: 'メモ' },
];

export function WordStatusPill({ status }: { status: WordStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-bold leading-none"
      style={{ color: style.fg, background: style.bg, border: `1px solid ${style.border}` }}
    >
      {style.label}
    </span>
  );
}

export function WordListRow({
  entry,
  onOpen,
  onToggleFavorite,
}: {
  entry: WordListEntry;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const { word } = entry;
  const marks = FEATURE_MARKS.filter(({ key }) => hasFeature(entry, key));

  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-[var(--color-border)] bg-white px-3 py-[11px]">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">
            {word.english}
          </span>
          {word.partOfSpeechTags?.[0] && (
            <span className="shrink-0 font-mono text-[9px] text-[var(--color-muted)]">
              {word.partOfSpeechTags[0]}
            </span>
          )}
          {word.cefrLevel && (
            <span className="shrink-0 rounded-[3px] border border-[var(--color-border)] px-1 font-mono text-[9px] font-bold text-[var(--color-muted)]">
              {word.cefrLevel}
            </span>
          )}
        </div>

        <div className="mt-px truncate text-[11px] text-[var(--color-muted)]">
          <TranslationDisplay word={word} compact />
        </div>

        <div className="mt-[3px] flex items-center gap-1.5 overflow-hidden font-mono text-[9px] text-[var(--color-muted)]">
          <span className="truncate">{entry.projectTitle}</span>
          {marks.length > 0 && (
            <span className="shrink-0 truncate opacity-70">{marks.map((m) => m.mark).join('・')}</span>
          )}
          {entry.wrongCount > 0 && (
            <span className="shrink-0 font-bold text-[var(--color-error)]">誤答{entry.wrongCount}</span>
          )}
        </div>
      </button>

      <WordStatusPill status={word.status} />

      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={word.isFavorite ? 'ブックマークを外す' : 'ブックマークする'}
        aria-pressed={word.isFavorite}
        className="inline-flex shrink-0"
        style={{ color: word.isFavorite ? 'var(--color-accent)' : 'var(--color-muted)' }}
      >
        <Icon name="bookmark" size={16} filled={word.isFavorite} />
      </button>
    </div>
  );
}
