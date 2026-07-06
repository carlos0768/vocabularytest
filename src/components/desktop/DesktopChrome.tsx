'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type InputHTMLAttributes, type ReactNode, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { getStreakDays } from '@/lib/utils';
import { cn } from '@/lib/utils';

type NavKey = 'home' | 'books' | 'stats' | 'reels' | 'friends' | 'shared' | 'fav' | 'scan' | 'settings';

const NAV_ITEMS: { key: NavKey; href: string; icon: string; label: string; count?: number }[] = [
  { key: 'home', href: '/', icon: 'home', label: 'ホーム' },
  { key: 'stats', href: '/stats', icon: 'bar_chart', label: '統計' },
  { key: 'reels', href: '/reels', icon: 'movie', label: 'リール' },
  { key: 'friends', href: '/friends', icon: 'groups', label: 'フィード' },
  { key: 'shared', href: '/shared', icon: 'group', label: '共有ライブラリ', count: 6 },
  { key: 'fav', href: '/favorites', icon: 'star', label: 'お気に入り', count: 21 },
  { key: 'scan', href: '/scan', icon: 'photo_camera', label: 'スキャン' },
  { key: 'settings', href: '/settings', icon: 'settings', label: '設定' },
];

function activeKeyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  if (pathname === '/projects' || pathname.startsWith('/project/') || pathname.startsWith('/word/')) return 'books';
  if (pathname === '/stats') return 'stats';
  if (pathname === '/reels') return 'reels';
  if (pathname === '/friends') return 'friends';
  if (pathname === '/shared' || pathname.startsWith('/share/') || pathname.startsWith('/groups/')) return 'shared';
  if (pathname === '/favorites' || pathname.startsWith('/collections')) return 'fav';
  if (pathname.startsWith('/scan')) return 'scan';
  if (pathname === '/settings' || pathname.startsWith('/subscription')) return 'settings';
  return 'home';
}

export function DesktopSidebar({
  collapsed = false,
  onToggle,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const pathname = usePathname();
  const { user, isPro } = useAuth();
  const [streak, setStreak] = useState(0);
  const active = activeKeyForPath(pathname);
  const userInitial = user?.email?.charAt(0).toUpperCase() || 'R';
  const isLoggedIn = Boolean(user);

  useEffect(() => {
    const id = window.setTimeout(() => setStreak(isLoggedIn ? getStreakDays() : 0), 0);
    return () => window.clearTimeout(id);
  }, [isLoggedIn]);

  return (
    <aside className={cn('ds-side', collapsed && 'ds-side--collapsed')} aria-label="デスクトップナビゲーション">
      <div className="ds-side-head">
        <div className="ds-brand">
          <div className="ds-brand-row">
            <span className="ds-wordmark">{collapsed ? 'M' : 'MERKEN'}</span>
            <span className="ds-brand-dot" />
          </div>
          {!collapsed && <span className="ds-brand-sub">単語帳 · Desktop</span>}
        </div>
        {onToggle && (
          <button
            type="button"
            className="ds-sidebar-toggle"
            onClick={onToggle}
            title={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
            aria-label={collapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
          >
            <Icon name={collapsed ? 'chevron_right' : 'chevron_left'} />
          </button>
        )}
      </div>

      <nav className="ds-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn('ds-nav-item', isActive && 'active')}
              title={collapsed ? item.label : undefined}
            >
              <Icon name={item.icon} filled={isActive} />
              {!collapsed && <span className="ds-nav-text">{item.label}</span>}
              {!collapsed && item.count != null && <span className="ds-nav-count">{item.count}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="ds-side-foot">
        {!collapsed && (
          <div className="ds-streak">
            <Icon name="local_fire_department" style={{ color: '#f97316', fontSize: 22 }} />
            <div>
              <div className="n">
                {streak}
                <span style={{ fontSize: 11, fontWeight: 600 }}> 日連続</span>
              </div>
              <div className="l">今日も学習を継続中</div>
            </div>
          </div>
        )}
        {!collapsed && (
          <div className="ds-user">
            <div className="ds-avatar">{userInitial}</div>
            <div>
              <div className="nm">{user?.email?.split('@')[0] ?? 'ゲスト'}</div>
              <div className="pl">{isPro ? 'Pro メンバー' : 'Free メンバー'}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export function DesktopTopbar({
  title,
  crumb,
  children,
}: {
  title: string;
  crumb?: string;
  children?: ReactNode;
}) {
  return (
    <div className="ds-top">
      <div style={{ flex: 1, minWidth: 0 }}>
        {crumb && <div className="crumb">{crumb}</div>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
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
}: {
  children: ReactNode;
  href?: string;
  icon?: string;
  variant?: 'dark' | 'accent' | 'ghost';
  className?: string;
  onClick?: () => void;
  title?: string;
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
      <Link href={href} className={classes} title={title}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} onClick={onClick} title={title}>
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

export function DesktopLoading({ label = '読み込み中...' }: { label?: string }) {
  return (
    <div className="ds-scroll" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)' }}>
      <Icon name="progress_activity" className="animate-spin" />
      <span style={{ marginLeft: 8, fontSize: 14 }}>{label}</span>
    </div>
  );
}
