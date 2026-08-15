'use client';

/**
 * 単語対戦の画面シェル。ロビー・待機・対戦・結果のすべてが同じ枠を使う。
 *
 * ヘッダはホームや単語帳詳細と同じ「スクロールしても上に残る固定ヘッダ」
 * (sticky + ノッチ分の top オフセット)。ノッチ帯そのものは全体共通の
 * StatusBarCover が覆うので、ここでは safe-area の下端に貼り付ける。
 */

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { usePageScrolled } from '@/hooks/use-page-scrolled';
import { cn } from '@/lib/utils';

export function BattleScreen({
  eyebrow,
  title,
  icon,
  action,
  subHeader,
  backHref = '/',
  onBack,
  showBack = true,
  center = false,
  withBottomNav = false,
  children,
}: {
  /** ヘッダ上段のラベル (英字・モノスペース) */
  eyebrow: string;
  title: string;
  /** タイトル左のアイコン。戻るボタンを出さない画面の目印にもなる */
  icon?: string;
  /** ヘッダ右のアクション (降参ボタンなど) */
  action?: ReactNode;
  /** 固定ヘッダ内の下段 (スコアボードやタイマーなど、常時見せたいもの) */
  subHeader?: ReactNode;
  backHref?: string;
  /** 指定すると戻るボタンで履歴を戻らずこちらを呼ぶ (退出確認など) */
  onBack?: () => void;
  showBack?: boolean;
  /** 本文を縦中央に寄せる (待機・結果画面) */
  center?: boolean;
  /** ボトムナビが出るページ (ロビー) では下端に余白を足す */
  withBottomNav?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pageScrolled = usePageScrolled();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  };

  return (
    <div
      className={cn(
        'relative mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col bg-[var(--color-background)] px-[18px] font-[var(--font-body)]',
        withBottomNav ? 'pb-[110px]' : 'pb-[calc(env(safe-area-inset-bottom,0px)+24px)]',
      )}
    >
      <header
        className={cn(
          'sticky z-40 -mx-[18px] border-b-2 bg-[var(--color-background)]/95 px-[18px] pb-2.5 pt-2.5 backdrop-blur-md',
          pageScrolled || subHeader ? 'border-[var(--solid-ink)]' : 'border-transparent',
        )}
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-2">
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              aria-label="戻る"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="chevron_left" size={16} />
            </button>
          ) : (
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white">
              <Icon name={icon ?? 'swords'} size={18} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
              {eyebrow}
            </div>
            <div className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
              {title}
            </div>
          </div>

          {action && <div className="shrink-0">{action}</div>}
        </div>

        {subHeader && <div className="pt-2.5">{subHeader}</div>}
      </header>

      <main className={cn('flex flex-1 flex-col pt-4', center && 'justify-center')}>{children}</main>
    </div>
  );
}

/** ヘッダ右に置く小さめの丸ボタン (降参・キャンセルなど)。 */
export function BattleHeaderAction({
  label,
  icon,
  onClick,
  tone = 'default',
}: {
  label: string;
  icon: string;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[34px] shrink-0 items-center gap-1 rounded-full border-2 px-3 text-[12px] font-bold transition-all duration-100 active:translate-x-px active:translate-y-px',
        tone === 'danger'
          ? 'border-[var(--color-error)] bg-[var(--color-error-light)] text-[var(--color-error)]'
          : 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]',
      )}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
