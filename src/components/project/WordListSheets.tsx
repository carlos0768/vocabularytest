'use client';

import { Icon } from '@/components/ui';

type Activeness = 'all' | 'active' | 'passive';
type SortOrder = 'priority' | 'createdAsc' | 'alphabetical' | 'statusAsc';

const POS_LABEL_MAP: Record<string, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  preposition: '前置詞',
  conjunction: '接続詞',
  pronoun: '代名詞',
  interjection: '感動詞',
  determiner: '限定詞',
  auxiliary: '助動詞',
  phrase: '句',
  idiom: 'イディオム',
  phrasal_verb: '句動詞',
  other: 'その他',
};

type BottomSheetShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function BottomSheetShell({ open, onClose, title, children, footer }: BottomSheetShellProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end lg:items-center lg:justify-center lg:px-6"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        aria-label="閉じる"
        onClick={onClose}
      />
      {/* Mobile: bottom sheet / Desktop (lg+): centered solid card */}
      <div
        className="relative flex max-h-[80vh] w-full animate-fade-in-up flex-col rounded-t-[20px] border-2 border-b-0 border-[var(--solid-ink)] bg-[#faf7f1] shadow-[0_-8px_24px_rgba(26,26,26,0.18)] lg:max-w-[460px] lg:rounded-[20px] lg:border-b-2 lg:"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <span className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(26,26,26,0.1)] px-5 pb-3 pt-1 lg:pt-4">
          <span className="w-8" />
          <h2 className="font-display text-[16px] font-extrabold text-[var(--solid-ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

        {footer}
      </div>
    </div>
  );
}

type WordFilterSheetProps = {
  open: boolean;
  onClose: () => void;
  bookmark: boolean;
  onBookmarkChange: (v: boolean) => void;
  activeness: Activeness;
  onActivenessChange: (v: Activeness) => void;
  pos: string | null;
  onPosChange: (v: string | null) => void;
  availablePartsOfSpeech: string[];
  hasActiveFilters: boolean;
  onReset: () => void;
};

export function WordFilterSheet({
  open,
  onClose,
  bookmark,
  onBookmarkChange,
  activeness,
  onActivenessChange,
  pos,
  onPosChange,
  availablePartsOfSpeech,
  hasActiveFilters,
  onReset,
}: WordFilterSheetProps) {
  return (
    <BottomSheetShell
      open={open}
      onClose={onClose}
      title="フィルタ"
      footer={
        <div
          className="flex items-center gap-2.5 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-3 lg:pb-5"
          style={{ borderTop: '1px solid rgba(26,26,26,0.1)' }}
        >
          <button
            type="button"
            onClick={onReset}
            disabled={!hasActiveFilters}
            className="relative flex-1 disabled:opacity-40"
          >
            <div className="absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
            <span className="relative flex h-[42px] items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[13px] font-bold text-[var(--solid-ink)]">
              リセット
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="relative flex-1"
          >
            <div className="absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
            <span className="relative flex h-[42px] items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[13px] font-bold text-white">
              適用
            </span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Bookmark */}
        <label className="flex cursor-pointer items-center justify-between rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3.5 py-3">
          <span className="flex items-center gap-2 text-[13px] font-bold text-[var(--solid-ink)]">
            <Icon name="bookmark" size={15} filled={bookmark} />
            ブックマークのみ
          </span>
          <div
            className="flex h-5 w-5 items-center justify-center rounded-[4px] border-2 border-[var(--solid-ink)]"
            style={{ background: bookmark ? 'var(--solid-ink)' : 'transparent' }}
          >
            {bookmark && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12l5 5L20 6"/>
              </svg>
            )}
          </div>
          <input
            type="checkbox"
            checked={bookmark}
            onChange={(e) => onBookmarkChange(e.target.checked)}
            className="sr-only"
          />
        </label>

        {/* Active / Passive */}
        <div>
          <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">アクティブ / パッシブ</p>
          <div className="flex flex-wrap gap-[5px]">
            {([
              ['all', 'すべて'],
              ['active', 'アクティブ'],
              ['passive', 'パッシブ'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => onActivenessChange(val)}
                className="inline-flex items-center rounded-full border-2 border-[var(--solid-ink)] px-[10px] py-[6px] text-[11px] font-bold transition-colors"
                style={{
                  background: activeness === val ? 'var(--solid-ink)' : '#fff',
                  color: activeness === val ? '#fff' : 'var(--solid-ink)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Part of speech */}
        {availablePartsOfSpeech.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">品詞</p>
            <div className="flex flex-wrap gap-[5px]">
              <button
                type="button"
                onClick={() => onPosChange(null)}
                className="inline-flex items-center rounded-full border-2 border-[var(--solid-ink)] px-[10px] py-[6px] text-[11px] font-bold transition-colors"
                style={{
                  background: !pos ? 'var(--solid-ink)' : '#fff',
                  color: !pos ? '#fff' : 'var(--solid-ink)',
                }}
              >
                すべて
              </button>
              {availablePartsOfSpeech.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPosChange(p)}
                  className="inline-flex items-center rounded-full border-2 border-[var(--solid-ink)] px-[10px] py-[6px] text-[11px] font-bold transition-colors"
                  style={{
                    background: pos === p ? 'var(--solid-ink)' : '#fff',
                    color: pos === p ? '#fff' : 'var(--solid-ink)',
                  }}
                >
                  {POS_LABEL_MAP[p.toLowerCase()] ?? p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomSheetShell>
  );
}

type WordSortSheetProps = {
  open: boolean;
  onClose: () => void;
  sortOrder: SortOrder;
  onSortOrderChange: (v: SortOrder) => void;
};

const SORT_OPTIONS: Array<{ value: SortOrder; label: string; description: string; icon: string }> = [
  { value: 'priority', label: '学習順', description: 'クイズ・カードと同じ並び順', icon: 'school' },
  { value: 'createdAsc', label: '追加順', description: '追加した順に表示', icon: 'schedule' },
  { value: 'alphabetical', label: 'アルファベット', description: 'A → Z の順に表示', icon: 'sort_by_alpha' },
  { value: 'statusAsc', label: '未習得順', description: '未習得の単語を先に表示', icon: 'trending_up' },
];

export function WordSortSheet({ open, onClose, sortOrder, onSortOrderChange }: WordSortSheetProps) {
  return (
    <BottomSheetShell open={open} onClose={onClose} title="並べ替え">
      <div className="flex flex-col gap-[7px]">
        {SORT_OPTIONS.map((opt) => {
          const selected = sortOrder === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSortOrderChange(opt.value); onClose(); }}
              className="flex items-center gap-[11px] rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-[11px] text-left transition-all"
              style={{
                background: selected ? 'var(--solid-ink)' : '#fff',
                color: selected ? '#fff' : 'var(--solid-ink)',
                boxShadow: selected ? '2px 2px 0 var(--solid-ink)' : 'none',
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
                style={{
                  background: selected ? 'rgba(255,255,255,0.12)' : 'var(--color-surface-secondary)',
                  border: selected ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--color-border)',
                }}
              >
                <Icon name={opt.icon} size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">{opt.label}</span>
                <span className="block text-[11px] opacity-70 mt-0.5">{opt.description}</span>
              </div>
              <div
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ border: selected ? '1.5px solid #fff' : '1.5px solid var(--solid-ink)' }}
              >
                {selected && <div className="h-[7px] w-[7px] rounded-full bg-white" />}
              </div>
            </button>
          );
        })}
      </div>
    </BottomSheetShell>
  );
}
