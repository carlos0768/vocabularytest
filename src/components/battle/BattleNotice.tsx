'use client';

/**
 * 対戦を始められないとき (未ログイン・Free・部屋が見つからない) に出す
 * 中央寄せの案内カード。文言とCTAだけ差し替えて使い回す。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export function BattleNotice({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const actionClass =
    'inline-flex h-[46px] w-full items-center justify-center gap-1.5 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[14px] font-bold text-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]';

  return (
    <div className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-6 text-center shadow-[2px_3px_0_var(--solid-ink)]">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]">
        <Icon name={icon} size={26} />
      </span>
      <h2 className="font-display text-[18px] font-black text-[var(--solid-ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-[1.8] text-[var(--color-muted)]">
        {description}
      </p>

      {actionLabel && actionHref && (
        <Link href={actionHref} className={`${actionClass} mt-5`}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button type="button" onClick={onAction} className={`${actionClass} mt-5`}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
