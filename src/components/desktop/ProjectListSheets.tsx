'use client';

import { Icon } from '@/components/ui';
import { BottomSheetShell } from '@/components/project/WordListSheets';

export type ProjectSort = 'newest' | 'words' | 'lastUsed';
export type ProjectFilter = 'all' | 'fav';

const PROJECT_SORT_OPTIONS: Array<{
  value: ProjectSort;
  label: string;
  description: string;
  icon: string;
}> = [
  { value: 'newest', label: '新しい順', description: '最近作成した単語帳を先に表示', icon: 'schedule' },
  { value: 'words', label: '単語が多い順', description: '語数が多い単語帳を先に表示', icon: 'sort' },
  { value: 'lastUsed', label: '最近使った順', description: '最近使った単語帳を先に表示', icon: 'history' },
];

type ProjectSortSheetProps = {
  open: boolean;
  onClose: () => void;
  sort: ProjectSort;
  onSortChange: (v: ProjectSort) => void;
};

/** /project/* の WordSortSheet と同じ見た目で、単語帳一覧の並べ替えを選ぶシート。 */
export function ProjectSortSheet({ open, onClose, sort, onSortChange }: ProjectSortSheetProps) {
  return (
    <BottomSheetShell open={open} onClose={onClose} title="並べ替え">
      <div className="flex flex-col gap-[7px]">
        {PROJECT_SORT_OPTIONS.map((opt) => {
          const selected = sort === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onSortChange(opt.value); onClose(); }}
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

type ProjectFilterSheetProps = {
  open: boolean;
  onClose: () => void;
  filter: ProjectFilter;
  onFilterChange: (v: ProjectFilter) => void;
};

/** /project/* の WordFilterSheet と同じ見た目で、単語帳一覧の絞り込みを選ぶシート。 */
export function ProjectFilterSheet({ open, onClose, filter, onFilterChange }: ProjectFilterSheetProps) {
  const bookmark = filter === 'fav';
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
            onClick={() => onFilterChange('all')}
            disabled={!bookmark}
            className="relative flex-1 disabled:opacity-40"
          >
            <div className="absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
            <span className="relative flex h-[42px] items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[13px] font-bold text-[var(--solid-ink)]">
              リセット
            </span>
          </button>
          <button type="button" onClick={onClose} className="relative flex-1">
            <div className="absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
            <span className="relative flex h-[42px] items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[13px] font-bold text-white">
              適用
            </span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <label className="flex cursor-pointer items-center justify-between rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3.5 py-3">
          <span className="flex items-center gap-2 text-[13px] font-bold text-[var(--solid-ink)]">
            <Icon name="bookmark" size={15} filled={bookmark} />
            保存した単語帳のみ
          </span>
          <div
            className="flex h-5 w-5 items-center justify-center rounded-[4px] border-2 border-[var(--solid-ink)]"
            style={{ background: bookmark ? 'var(--solid-ink)' : 'transparent' }}
          >
            {bookmark && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12l5 5L20 6" />
              </svg>
            )}
          </div>
          <input
            type="checkbox"
            checked={bookmark}
            onChange={(e) => onFilterChange(e.target.checked ? 'fav' : 'all')}
            className="sr-only"
          />
        </label>
      </div>
    </BottomSheetShell>
  );
}
