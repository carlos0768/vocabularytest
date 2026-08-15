'use client';

/**
 * 対戦画面・ロビー共通の固定ヘッダー。
 * 単語帳詳細やグループページと同じ sticky パターンで、top はノッチ下端に合わせる
 * （ノッチ帯は全体共通の StatusBarCover が覆う）。下線はコンテンツがヘッダの下に
 * 潜り込んだときだけ出す。
 */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { usePageScrolled } from '@/hooks/use-page-scrolled';

export function BattleHeaderButton({
  children,
  onClick,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

export function BattleScreenHeader({
  eyebrow,
  title,
  trailing,
  onBack,
  fallbackHref = '/battle',
}: {
  eyebrow: string;
  title: string;
  trailing?: ReactNode;
  /** 指定すると戻る前に確認や降参処理を挟める。 */
  onBack?: () => void;
  fallbackHref?: string;
}) {
  const router = useRouter();
  const pageScrolled = usePageScrolled();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    // 直前の画面に戻す。履歴が無い場合のみ対戦トップへ。
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace(fallbackHref);
  };

  return (
    <header
      className={`sticky z-40 flex items-center gap-2.5 border-b-2 bg-[var(--color-background)]/95 px-[14px] py-2.5 backdrop-blur-md ${
        pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'
      }`}
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <BattleHeaderButton onClick={handleBack} aria-label="戻る">
        <Icon name="arrow_back" size={16} />
      </BattleHeaderButton>

      <div className="min-w-0 flex-1">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          {eyebrow}
        </div>
        <div className="truncate font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">
          {title}
        </div>
      </div>

      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </header>
  );
}
