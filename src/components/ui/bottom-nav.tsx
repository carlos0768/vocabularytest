'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CreateWordbookSheet } from '@/components/home/CreateWordbookSheet';

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
    <circle cx="9" cy="8" r="3"/>
    <path d="M3.5 20a5.5 5.5 0 0111 0"/>
    <circle cx="17" cy="10" r="2.5"/>
    <path d="M15.5 16.5a4.5 4.5 0 015 3.5"/>
  </svg>
);

const SharedIconFilled = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3"/>
    <path d="M3.5 20a5.5 5.5 0 0111 0"/>
    <circle cx="17" cy="10" r="2.5"/>
    <path d="M15.5 16.5a4.5 4.5 0 015 3.5"/>
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

const StatsIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18"/>
    <path d="M7 16l4-4 4 4 4-6"/>
  </svg>
);

const StatsIconFilled = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18"/>
    <path d="M7 16l4-4 4 4 4-6"/>
  </svg>
);

const ScanPlusIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 8v8M8 12h8"/>
  </svg>
);

interface TabItem {
  k: string;
  label: string;
  href?: string;
  matchPaths?: string[];
  primary?: boolean;
  IconDefault: React.FC;
  IconActive: React.FC;
}

const TABS: TabItem[] = [
  {
    k: 'home',
    label: 'ホーム',
    href: '/',
    matchPaths: ['/'],
    IconDefault: HomeIcon,
    IconActive: HomeIconFilled,
  },
  {
    k: 'shared',
    label: '共有',
    href: '/shared',
    matchPaths: ['/shared', '/share'],
    IconDefault: SharedIcon,
    IconActive: SharedIconFilled,
  },
  {
    k: 'create',
    label: '作成',
    primary: true,
    IconDefault: ScanPlusIcon,
    IconActive: ScanPlusIcon,
  },
  {
    k: 'stats',
    label: '進歩',
    href: '/stats',
    matchPaths: ['/stats'],
    IconDefault: StatsIcon,
    IconActive: StatsIconFilled,
  },
  {
    k: 'account',
    label: 'アカウント',
    href: '/settings',
    matchPaths: ['/settings', '/subscription'],
    IconDefault: AccountIcon,
    IconActive: AccountIconFilled,
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  const isActive = (tab: TabItem) => {
    if (!tab.matchPaths || !tab.href) return false;
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
          background: 'linear-gradient(to top, #faf7f1 70%, rgba(250,247,241,0))',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            margin: '0 14px',
            background: '#fff',
            border: '2px solid var(--solid-ink)',
            borderRadius: 22,
            padding: '8px 10px',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            pointerEvents: 'auto',
          }}
        >
          {TABS.map((tab) => {
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
                      color: '#fff',
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
