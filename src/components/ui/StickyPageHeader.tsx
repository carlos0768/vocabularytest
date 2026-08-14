'use client';

/**
 * スクロールしても画面上部に残るページ内ヘッダ。
 * 単語帳詳細 (/project/[id]) と同じ挙動で、下線はコンテンツがヘッダの下に
 * 潜り込んだとき（スクロール中）だけ出す。
 * アカウント・設定まわりのページで共用する。
 */

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { usePageScrolled } from '@/hooks/use-page-scrolled';

export function StickyPageHeader({
  eyebrow,
  title,
  onBack,
  backLabel = '戻る',
  right,
  className = '',
}: {
  /** 見出しの上に出していた英字ラベル。見出しの右に小さく並べる。 */
  eyebrow?: string;
  title: string;
  /** 省略すると戻るボタンを出さない。 */
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  className?: string;
}) {
  const scrolled = usePageScrolled();

  return (
    <header
      className={`sticky z-40 flex items-center gap-2.5 border-b-2 bg-[var(--color-background)]/95 px-[18px] py-2.5 backdrop-blur-md ${
        scrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'
      } ${className}`}
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="chevron_left" size={20} />
        </button>
      )}
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-display text-[19px] font-extrabold leading-none tracking-[-0.02em] text-[var(--solid-ink)]">
          {title}
        </span>
        {eyebrow && (
          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
            {eyebrow}
          </span>
        )}
      </div>
      {right}
    </header>
  );
}
