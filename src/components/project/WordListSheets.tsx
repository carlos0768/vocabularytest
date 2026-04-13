'use client';

import { Icon } from '@/components/ui';

type Activeness = 'all' | 'active' | 'passive';
type SortOrder = 'createdAsc' | 'alphabetical' | 'statusAsc';

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
};

type BottomSheetShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

function BottomSheetShell({ open, onClose, title, children, footer }: BottomSheetShellProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg bg-[var(--color-background)] rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[min(90vh,640px)] flex flex-col animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-2.5 pb-1 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[var(--color-border)]" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3 border-b border-[var(--color-border-light)]">
          <span className="w-10" />
          <h2 className="text-base font-bold text-[var(--color-foreground)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center text-[var(--color-foreground)]"
            aria-label="閉じる"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">{children}</div>

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
        <div className="px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[var(--color-border-light)] flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            disabled={!hasActiveFilters}
            className="flex-1 h-11 rounded-full border border-[var(--color-border)] text-sm font-bold text-[var(--color-foreground)] disabled:opacity-40"
          >
            リセット
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-full bg-[var(--color-accent)] text-sm font-bold text-white"
          >
            適用
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Bookmark */}
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
            <Icon name="bookmark" size={16} filled={bookmark} />
            ブックマークのみ
          </span>
          <input
            type="checkbox"
            checked={bookmark}
            onChange={(e) => onBookmarkChange(e.target.checked)}
            className="accent-[var(--color-accent)] w-4 h-4"
          />
        </label>

        {/* Active / Passive */}
        <div>
          <p className="text-xs font-bold text-[var(--color-muted)] mb-2">アクティブ / パッシブ</p>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'すべて'],
              ['active', 'アクティブ'],
              ['passive', 'パッシブ'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => onActivenessChange(val)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  activeness === val
                    ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Part of speech */}
        {availablePartsOfSpeech.length > 0 && (
          <div>
            <p className="text-xs font-bold text-[var(--color-muted)] mb-2">品詞</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPosChange(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  !pos
                    ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                }`}
              >
                すべて
              </button>
              {availablePartsOfSpeech.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPosChange(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    pos === p
                      ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border-light)]'
                  }`}
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
  { value: 'createdAsc', label: '追加順', description: '追加した順に表示', icon: 'schedule' },
  { value: 'alphabetical', label: 'アルファベット', description: 'A → Z の順に表示', icon: 'sort_by_alpha' },
  { value: 'statusAsc', label: '未習得順', description: '未習得の単語を先に表示', icon: 'trending_up' },
];

export function WordSortSheet({ open, onClose, sortOrder, onSortOrderChange }: WordSortSheetProps) {
  return (
    <BottomSheetShell open={open} onClose={onClose} title="並べ替え">
      <div className="space-y-2">
        {SORT_OPTIONS.map((opt) => {
          const selected = sortOrder === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onSortOrderChange(opt.value);
                onClose();
              }}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-colors ${
                selected
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-secondary)]'
              }`}
            >
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  selected
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
                }`}
              >
                <Icon name={opt.icon} size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-[var(--color-foreground)]">{opt.label}</span>
                <span className="block text-xs text-[var(--color-muted)] mt-0.5">{opt.description}</span>
              </span>
              <Icon
                name={selected ? 'check_circle' : 'radio_button_unchecked'}
                size={20}
                className={selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}
              />
            </button>
          );
        })}
      </div>
    </BottomSheetShell>
  );
}
