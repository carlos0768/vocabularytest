'use client';

/**
 * 対戦に持ち込む単語帳を選ぶ横スクロールの棚。ホームのタイルと同じ配色ロジック
 * (id ハッシュ → 固定パレット) を使い、選択中だけアクセント枠 + チェックを出す。
 *
 * 出題は両者の単語帳をマージして作られるので、ここで選ぶのは「自分が出す側」。
 */

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(hash) % THUMBS.length];
}

export function BattleWordbookPicker({
  projects,
  loading,
  selectedId,
  onSelect,
  disabled = false,
}: {
  projects: Project[];
  loading: boolean;
  selectedId: string;
  onSelect: (projectId: string) => void;
  disabled?: boolean;
}) {
  if (loading && projects.length === 0) {
    return (
      <div className="no-scrollbar -mx-[18px] flex gap-2.5 overflow-x-auto px-[18px]">
        {[0, 1, 2].map((slot) => (
          <div
            key={slot}
            className="h-[104px] w-[132px] shrink-0 animate-pulse rounded-[14px] border-2 border-[rgba(26,26,26,0.12)] bg-[var(--color-surface-secondary)]"
          />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-[14px] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
        <p className="text-[12.5px] font-bold leading-[1.7] text-[var(--color-muted)]">
          単語帳がまだありません。
          <br />
          先に単語帳を作ると対戦できます。
        </p>
      </div>
    );
  }

  return (
    <div className="no-scrollbar -mx-[18px] flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[18px] pb-1 scroll-pl-[18px]">
      {projects.map((project) => {
        const selected = project.id === selectedId;
        return (
          <button
            key={project.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onSelect(project.id)}
            className={cn(
              'relative flex h-[104px] w-[132px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[14px] border-2 p-2.5 text-left text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50',
              selected
                ? 'border-[var(--color-accent)] shadow-[2px_3px_0_var(--color-accent)]'
                : 'border-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)]',
            )}
            style={{
              backgroundColor: thumbColor(project.id),
              backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="absolute inset-y-0 left-0 w-[6px] bg-[rgba(0,0,0,0.22)]" />

            <span className="flex items-center justify-between pl-1.5">
              <Icon name="menu_book" size={14} className="drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]" />
              {selected && (
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent)]">
                  <Icon name="check" size={11} />
                </span>
              )}
            </span>

            <span className="line-clamp-2 pl-1.5 font-display text-[12.5px] font-bold leading-snug drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
              {project.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
