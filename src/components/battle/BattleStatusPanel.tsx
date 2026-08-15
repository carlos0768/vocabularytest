'use client';

/**
 * 読み込み中・待機中・エラーなど「本文がない状態」の共通レイアウト。
 * ヘッダーは各ページ側が出すので、ここは中央寄せの本文だけを担う。
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

export function BattleSpinner({ size = 40 }: { size?: number }) {
  return (
    <div
      className="animate-spin rounded-full border-[3px] border-[var(--color-surface-secondary)] border-t-[var(--solid-ink)]"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label="読み込み中"
    />
  );
}

export function BattleStatusPanel({
  icon,
  spinning = false,
  title,
  description,
  children,
  actions,
}: {
  /** spinning が false のときに出すアイコン。 */
  icon?: string;
  spinning?: boolean;
  title: string;
  description?: string;
  /** 招待コードなど、説明文の下に差し込む要素。 */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      {spinning ? (
        <BattleSpinner />
      ) : icon ? (
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
          <Icon name={icon} size={24} className="text-[var(--solid-ink)]" />
        </div>
      ) : null}

      <h2 className="mt-5 font-display text-[19px] font-black tracking-tight text-[var(--solid-ink)]">
        {title}
      </h2>

      {description && (
        <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-[var(--color-muted)]">
          {description}
        </p>
      )}

      {children && <div className="mt-6 w-full max-w-[320px]">{children}</div>}

      {actions && <div className="mt-8 flex w-full max-w-[320px] flex-col gap-2.5">{actions}</div>}
    </div>
  );
}
