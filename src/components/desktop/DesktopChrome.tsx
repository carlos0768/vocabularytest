'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { CreateWordbookSheet } from '@/components/home/CreateWordbookSheet';
import { DesktopWordSearchOverlay } from '@/components/desktop/DesktopWordSearchOverlay';
import { Icon } from '@/components/ui/Icon';
import { NavTabIcon } from '@/components/ui/NavTabIcon';
import { useAuth } from '@/hooks/use-auth';
import { useCoins } from '@/hooks/use-coins';
import { prefetchReelFeed } from '@/hooks/use-reel-feed';
import { getNavTabs, isNavTabActive } from '@/lib/navigation/tabs';
import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────
   デスクトップヘッダー
   左: ロゴ / 中央: ピル型タブ (モバイルのボトムナビと同じ並び) / 右: コイン + 検索
   ──────────────────────────────────────────────────────────── */

export function DesktopHeader() {
  const pathname = usePathname();
  const { user, isPro } = useAuth();
  const { enabled: coinsEnabled, balance: coinBalance } = useCoins();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // タブの定義と並びは src/lib/navigation/tabs.ts (ボトムナビ・タブレットのサイドバーと共通)
  const tabs = getNavTabs(isPro);

  return (
    <header className="ds-header" aria-label="デスクトップナビゲーション">
      <Link href="/" className="ds-header-brand" aria-label="MERKEN ホーム">
        MERKEN<span className="dot" />
      </Link>

      <nav className="ds-pillnav">
        {tabs.map((tab) => {
          if (tab.primary) {
            return (
              <button
                key={tab.key}
                type="button"
                className="ds-pillnav-create"
                onClick={() => setCreateOpen(true)}
                aria-label="作成"
                title="新しい単語帳"
              >
                <span>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                </span>
              </button>
            );
          }
          const active = isNavTabActive(tab, pathname);
          return (
            <Link
              key={tab.key}
              href={tab.href!}
              className={cn('ds-pillnav-item', active && 'active')}
              aria-current={active ? 'page' : undefined}
              onPointerDown={tab.key === 'reels' ? () => prefetchReelFeed() : undefined}
            >
              <NavTabIcon path={tab.iconPath} filled={active && Boolean(tab.fillWhenActive)} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="ds-header-side">
        {coinsEnabled && isPro && (
          <Link href="/coins" className="ds-header-coins" aria-label={`コイン残高 ${coinBalance.totalRemaining}枚`} title={`今月分 ${coinBalance.monthlyRemaining} / 購入 ${coinBalance.purchasedRemaining}`}>
            <Icon name="toll" />
            <span className="n">{coinBalance.totalRemaining}</span>
            <span className="u">枚</span>
          </Link>
        )}
        {user && (
          <button
            type="button"
            className="ds-iconbtn-round"
            onClick={() => setSearchOpen(true)}
            aria-label="自分の単語帳から単語を検索"
            title="単語を検索"
          >
            <Icon name="search" />
          </button>
        )}
      </div>

      {/* 「＋作成」: モバイルのボトムナビと同じ作成フローを中央モーダルで出す */}
      <CreateWordbookSheet isOpen={createOpen} onClose={() => setCreateOpen(false)} variant="modal" />
      {/* 単語検索。開くたびにマウントし直して状態を初期化する */}
      {searchOpen && user && <DesktopWordSearchOverlay onClose={() => setSearchOpen(false)} userId={user.id} />}
    </header>
  );
}

/* ────────────────────────────────────────────────────────────
   ページ内トップバー (小見出し + タイトル + 右側アクション)
   ──────────────────────────────────────────────────────────── */

export function DesktopTopbar({
  title,
  crumb,
  leading,
  back = true,
  backFallbackHref = '/',
  children,
}: {
  title: string;
  crumb?: string;
  /** 左端に置く任意の要素。指定したときは既定の戻るボタンを出さない */
  leading?: ReactNode;
  /** 戻るボタン。タブの起点になるページ（共有・アカウントなど）だけ false にする */
  back?: boolean;
  /** 履歴が無いとき（直接URLを開いたとき）の戻り先 */
  backFallbackHref?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ds-top">
      {leading ?? (back && <DesktopBackButton fallbackHref={backFallbackHref} />)}
      <div style={{ flex: 1, minWidth: 0 }}>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

/** 丸い戻るボタン。直前の画面に戻り、履歴が無ければ fallbackHref へ */
export function DesktopBackButton({ fallbackHref = '/', className }: { fallbackHref?: string; className?: string }) {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };
  return (
    <button type="button" className={cn('ds-iconbtn-round sm sq', className)} onClick={goBack} aria-label="戻る" title="戻る">
      <Icon name="arrow_back" />
    </button>
  );
}

export function DesktopSearchBox({
  placeholder = '単語・単語帳を検索',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="ds-search">
      <Icon name="search" />
      <span className="sr-only">{placeholder}</span>
      <input placeholder={placeholder} {...props} />
    </label>
  );
}

export function DesktopButton({
  children,
  href,
  icon,
  variant,
  className,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode;
  href?: string;
  icon?: string;
  variant?: 'dark' | 'accent' | 'ghost';
  className?: string;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  const iconOnly = children === '' || children === null || children === undefined;
  const content = (
    <>
      {icon && <Icon name={icon} />}
      {!iconOnly && children}
    </>
  );
  const classes = cn('ds-btn', variant, iconOnly && 'ds-btn--icon', className);
  if (href) {
    return (
      <Link href={href} className={classes} title={title} aria-label={iconOnly ? title : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} title={title} aria-label={iconOnly ? title : undefined} disabled={disabled}>
      {content}
    </button>
  );
}

export function DesktopDonut({
  mastered,
  review,
  total,
  size = 120,
  stroke = 16,
  percent,
}: {
  mastered: number;
  review: number;
  total: number;
  size?: number;
  stroke?: number;
  percent?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mFrac = total > 0 ? mastered / total : 0;
  const rFrac = total > 0 ? review / total : 0;
  const p = percent ?? (total > 0 ? Math.round(mFrac * 100) : 0);
  const cx = size / 2;

  return (
    <div className="ds-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-border-light)" strokeWidth={stroke} />
        {mFrac > 0 && (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="var(--color-success)"
            strokeWidth={stroke}
            strokeDasharray={`${c * mFrac} ${c * (1 - mFrac)}`}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}
        {rFrac > 0 && (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="var(--color-warning)"
            strokeWidth={stroke}
            strokeDasharray={`${c * rFrac} ${c * (1 - rFrac)}`}
            strokeDashoffset={-c * mFrac}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}
      </svg>
      <div className="ctr">
        <span className="p">{p}%</span>
        <span className="lb">習得</span>
      </div>
    </div>
  );
}
