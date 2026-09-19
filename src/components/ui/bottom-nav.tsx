'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CreateWordbookSheet } from '@/components/home/CreateWordbookSheet';
import { useAuth } from '@/hooks/use-auth';
import { prefetchReelFeed } from '@/hooks/use-reel-feed';

const HomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10l9-7 9 7V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V10z"/>
  </svg>
);

const HomeIconFilled = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10l9-7 9 7V20a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1V10z"/>
  </svg>
);

const SharedIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="12" r="2.5"/>
    <circle cx="18" cy="6" r="2.5"/>
    <circle cx="18" cy="18" r="2.5"/>
    <path d="M8 11l8-4M8 13l8 4"/>
  </svg>
);

const SharedIconFilled = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="12" r="2.5"/>
    <circle cx="18" cy="6" r="2.5"/>
    <circle cx="18" cy="18" r="2.5"/>
    <path d="M8 11l8-4M8 13l8 4"/>
  </svg>
);

const AccountIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21a8 8 0 0116 0"/>
  </svg>
);

const AccountIconFilled = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 21a8 8 0 0116 0"/>
  </svg>
);

const ScanPlusIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v8M8 12h8"/>
  </svg>
);

const ReelIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="3"/>
    <path d="M4 8h16"/>
    <path d="M10.5 12.2l4 2.3-4 2.3v-4.6z"/>
  </svg>
);

const ReelIconFilled = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="16" height="18" rx="3"/>
    <path d="M4 8h16" stroke="#fff" strokeWidth="1.5"/>
    <path d="M10.5 12.2l4 2.3-4 2.3v-4.6z" fill="#fff" stroke="#fff"/>
  </svg>
);

const GoalIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 21V4"/>
    <path d="M5 4h13l-3 4.5 3 4.5H5"/>
  </svg>
);

const GoalIconFilled = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 21V4" fill="none"/>
    <path d="M5 4h13l-3 4.5 3 4.5H5"/>
  </svg>
);

interface TabItem {
  k: string;
  label: string;
  href?: string;
  matchPaths?: string[];
  // 前方一致だと他人のページまで拾ってしまうパス用(例: /profile/[accountId])
  exactPaths?: string[];
  primary?: boolean;
  IconDefault: React.FC;
  IconActive: React.FC;
}

const HOME_TAB: TabItem = {
  k: 'home',
  label: 'ホーム',
  href: '/',
  matchPaths: ['/'],
  IconDefault: HomeIcon,
  IconActive: HomeIconFilled,
};

const CREATE_TAB: TabItem = {
  k: 'create',
  label: '作成',
  primary: true,
  IconDefault: ScanPlusIcon,
  IconActive: ScanPlusIcon,
};

const SHARED_TAB: TabItem = {
  k: 'shared',
  label: '共有',
  href: '/shared',
  matchPaths: ['/shared', '/groups'],
  IconDefault: SharedIcon,
  IconActive: SharedIconFilled,
};

const ACCOUNT_TAB: TabItem = {
  k: 'account',
  label: 'アカウント',
  href: '/profile',
  matchPaths: ['/settings', '/subscription'],
  exactPaths: ['/profile'],
  IconDefault: AccountIcon,
  IconActive: AccountIconFilled,
};

// Pro: 目標ページ入り(リールなし)。Free/ゲスト: 従来ナビ(リール入り)を維持。
// 単語一覧 (/words) は下部バーから外した。語法問題集はホームのセクションから開く。
const PRO_TABS: TabItem[] = [
  HOME_TAB,
  {
    k: 'goal',
    label: '目標',
    href: '/goal',
    matchPaths: ['/goal'],
    IconDefault: GoalIcon,
    IconActive: GoalIconFilled,
  },
  CREATE_TAB,
  SHARED_TAB,
  ACCOUNT_TAB,
];

const FREE_TABS: TabItem[] = [
  HOME_TAB,
  SHARED_TAB,
  CREATE_TAB,
  {
    k: 'reels',
    label: 'リール',
    href: '/reels',
    matchPaths: ['/reels'],
    IconDefault: ReelIcon,
    IconActive: ReelIconFilled,
  },
  ACCOUNT_TAB,
];

export function BottomNav() {
  const pathname = usePathname();
  const { isPro } = useAuth();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const tabs = isPro ? PRO_TABS : FREE_TABS;

  const isActive = (tab: TabItem) => {
    if (!tab.href) return false;
    if (tab.exactPaths?.some((path) => pathname === path)) return true;
    if (!tab.matchPaths) return false;
    return tab.matchPaths.some(
      (path) => pathname === path || pathname.startsWith(path + '/')
    );
  };

  return (
    <>
      <div
        className="lg:hidden"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          // Fades the page out behind the floating nav, so it has to track the
          // page ground — a literal cream here painted a bright band across the
          // bottom of every screen in dark mode.
          background: 'linear-gradient(to top, var(--color-background) 70%, transparent)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            margin: '0 14px',
            background: 'var(--color-surface)',
            border: '2px solid var(--solid-ink)',
            borderRadius: 22,
            padding: '8px 10px',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            pointerEvents: 'auto',
          }}
        >
          {tabs.map((tab) => {
            const active = isActive(tab);
            const Icon = active ? tab.IconActive : tab.IconDefault;

            if (tab.primary) {
              return (
                <button
                  key={tab.k}
                  type="button"
                  onClick={() => setCreateSheetOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    padding: '4px 6px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      background: 'var(--solid-ink)',
                      color: 'var(--color-on-ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid var(--solid-ink)',
                    }}
                  >
                    <Icon />
                  </div>
                </button>
              );
            }

            return (
              <Link
                key={tab.k}
                href={tab.href!}
                // リールはフィードAPIが重いので、タップした瞬間に初回ページの
                // 取得を先行開始して表示までの待ちを短縮する。
                onPointerDown={tab.k === 'reels' ? () => prefetchReelFeed() : undefined}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  color: active ? 'var(--solid-ink)' : 'var(--color-muted)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '4px 6px',
                  textDecoration: 'none',
                }}
              >
                <Icon />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <CreateWordbookSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
      />
    </>
  );
}
