'use client';

/**
 * 1つ選ぶ行 (アイコン + 見出し + 選んでいる名前 + ⇕)。行全体にネイティブ <select> を重ねて、
 * モバイルの選択UIをその場で開く (別画面に遷移しない)。
 * 対戦ロビーの出題単語帳・新規作成シートの「既存の単語帳にインポート」・
 * 単語追加のセクション選択で使う。
 */

import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

export type SelectRowOption = { value: string; label: string; disabled?: boolean };

export function SelectRow({
  options,
  value,
  onChange,
  label,
  valueText,
  icon,
  loading = false,
  disabled,
  className,
}: {
  options: SelectRowOption[];
  value: string;
  onChange: (value: string) => void;
  /** 行の上に小さく出す見出し (select のラベルも兼ねる) */
  label: string;
  /** 名前の位置に出す文言 (選んでいるものの名前) */
  valueText: string;
  /** 左の四角に入れる中身 */
  icon: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const selectId = useId();
  const selectable = options.length > 0 && !loading;

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
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      )}
      {icon}
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
          {label}
        </div>
        <div className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
          {loading ? '読み込み中...' : valueText}
        </div>
      </div>
      {selectable && (
        <Icon name="unfold_more" size={17} className="shrink-0 text-[var(--color-muted)]" />
      )}
    </div>
  );
}

/** SelectRow の左に置く四角 (単語帳アイコンと同じ形)。 */
export function SelectRowIcon({
  image,
  children,
}: {
  image?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] bg-cover bg-center font-display text-[15px] font-extrabold text-[var(--solid-ink)]"
      style={image ? { backgroundImage: `url(${image})` } : undefined}
    >
      {!image && children}
    </div>
  );
}

/** 単語帳を1冊選ぶ行。 */
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
  const selected = projects.find((project) => project.id === value) ?? null;
  const options: SelectRowOption[] = projects.length === 0 ? [] : [
    ...(emptyOptionLabel !== undefined ? [{ value: '', label: emptyOptionLabel }] : []),
    ...projects.map((project) => ({
      value: project.id,
      label: project.title,
      disabled: isOptionDisabled?.(project),
    })),
  ];

  return (
    <SelectRow
      options={options}
      value={value}
      onChange={onChange}
      label={label}
      valueText={selected?.title ?? placeholder}
      loading={loading}
      disabled={disabled}
      className={className}
      icon={(
        <SelectRowIcon image={selected?.iconImage}>
          {selected
            ? selected.title.charAt(0)
            : <Icon name="menu_book" size={17} className="text-[var(--color-muted)]" />}
        </SelectRowIcon>
      )}
    />
  );
}
