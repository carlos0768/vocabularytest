'use client';

/**
 * ロビーの入力フィールド群（単語帳選択・問題数/制限時間のセグメント・招待コード）。
 * 見た目はアプリ共通の solid（太枠 + ハードシャドウ）に揃えている。
 */

import { useId } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Project } from '@/types';

export function BattleFieldLabel({ icon, label, hint }: { icon: string; label: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-1.5 px-0.5">
      <Icon name={icon} size={15} className="translate-y-[2px] text-[var(--color-muted)]" />
      <span className="font-display text-[13px] font-extrabold text-[var(--solid-ink)]">{label}</span>
      {hint && <span className="font-mono text-[10px] font-bold text-[var(--color-muted)]">{hint}</span>}
    </div>
  );
}

/**
 * 出題元の単語帳を選ぶ。ネイティブの <select> を solid カードに重ねて、
 * モバイルの選択UI（ホイール）をそのまま使えるようにしている。
 */
export function BattleWordbookField({
  projects,
  value,
  loading,
  onChange,
}: {
  projects: Project[];
  value: string;
  loading: boolean;
  onChange: (projectId: string) => void;
}) {
  const selectId = useId();
  const selected = projects.find((project) => project.id === value) ?? null;

  return (
    <section>
      <BattleFieldLabel icon="menu_book" label="出題に使う単語帳" />

      {loading ? (
        <div className="h-[62px] animate-pulse rounded-[14px] border-2 border-[var(--color-border)] bg-[var(--color-surface-secondary)]" />
      ) : projects.length === 0 ? (
        <div className="rounded-[14px] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center">
          <p className="text-[12.5px] font-bold leading-[1.7] text-[var(--color-muted)]">
            単語帳がまだありません。
            <br />
            先に単語帳を作ると対戦できます。
          </p>
        </div>
      ) : (
        <div className="relative">
          <label htmlFor={selectId} className="sr-only">
            出題に使う単語帳
          </label>
          <select
            id={selectId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-3 shadow-[2px_3px_0_var(--solid-ink)]">
            <div
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] bg-cover bg-center font-display text-[17px] font-extrabold text-[var(--solid-ink)]"
              style={
                selected?.iconImage
                  ? { backgroundImage: `url(${selected.iconImage})` }
                  : undefined
              }
            >
              {!selected?.iconImage && (selected?.title.charAt(0) ?? '?')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                MY BOOK
              </div>
              <div className="truncate font-display text-[14.5px] font-extrabold text-[var(--solid-ink)]">
                {selected?.title ?? '単語帳を選ぶ'}
              </div>
            </div>
            <Icon name="unfold_more" size={18} className="shrink-0 text-[var(--color-muted)]" />
          </div>
        </div>
      )}

      <p className="mt-1.5 px-0.5 text-[11px] leading-[1.6] text-[var(--color-muted)]">
        問題はお互いの単語帳から交互に選ばれます。
      </p>
    </section>
  );
}

/** 問題数・制限時間などのセグメント選択。 */
export function BattleSegmentedField<T extends number>({
  icon,
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
}: {
  icon: string;
  label: string;
  hint?: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <BattleFieldLabel icon={icon} label={label} hint={hint} />
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`h-[46px] rounded-[12px] border-2 font-display text-[14px] font-extrabold transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50 ${
                active
                  ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-surface)] shadow-[2px_3px_0_var(--color-border)]'
                  : 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 招待コードの表示（1文字ずつコマに分ける）。 */
export function BattleInviteCode({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label={`招待コード ${code.split('').join(' ')}`}>
      {code.split('').map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="flex h-[52px] w-[38px] items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[24px] font-black text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)]"
        >
          {char}
        </span>
      ))}
    </div>
  );
}
