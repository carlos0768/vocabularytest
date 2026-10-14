'use client';

/**
 * 単語帳を1冊選ぶ行 (アイコン + 名前 + ⇕)。行全体にネイティブ <select> を重ねて、
 * モバイルの選択UIをその場で開く (別画面に遷移しない)。
 * 対戦ロビーの出題単語帳と、新規作成シートの「既存の単語帳にインポート」で使う。
 */

import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

export function WordbookSelectRow({
  projects,
  value,
  onChange,
  label,
  loading = false,
  emptyOptionLabel,
  placeholder = '単語帳がありません',
  isOptionDisabled,
  disabled,
  className,
}: {
  projects: Project[];
  /** 選んでいる単語帳ID。emptyOptionLabel があるときは '' で未選択 */
  value: string;
  onChange: (projectId: string) => void;
  /** 行の上に小さく出す見出し (select のラベルも兼ねる) */
  label: string;
  loading?: boolean;
  /** 未選択に戻す選択肢。渡したときだけ先頭に置く */
  emptyOptionLabel?: string;
  /** 未選択 (または単語帳が無い) ときに名前の位置へ出す文言 */
  placeholder?: string;
  isOptionDisabled?: (project: Project) => boolean;
  disabled?: boolean;
  className?: string;
}) {
  const selectId = useId();
  const selected = projects.find((project) => project.id === value) ?? null;
  const selectable = projects.length > 0 && !loading;

  return (
    <div className={cn('relative flex items-center gap-2.5 p-3', className)}>
      {selectable && (
        <>
          <label htmlFor={selectId} className="sr-only">
            {label}
          </label>
          <select
            id={selectId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          >
            {emptyOptionLabel !== undefined && <option value="">{emptyOptionLabel}</option>}
            {projects.map((project) => (
              <option key={project.id} value={project.id} disabled={isOptionDisabled?.(project)}>
                {project.title}
              </option>
            ))}
          </select>
        </>
      )}
      <div
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] bg-cover bg-center font-display text-[15px] font-extrabold text-[var(--solid-ink)]"
        style={selected?.iconImage ? { backgroundImage: `url(${selected.iconImage})` } : undefined}
      >
        {selected
          ? !selected.iconImage && selected.title.charAt(0)
          : <Icon name="menu_book" size={17} className="text-[var(--color-muted)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
          {label}
        </div>
        <div className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
          {loading ? '読み込み中...' : selected?.title ?? placeholder}
        </div>
      </div>
      {selectable && (
        <Icon name="unfold_more" size={17} className="shrink-0 text-[var(--color-muted)]" />
      )}
    </div>
  );
}
