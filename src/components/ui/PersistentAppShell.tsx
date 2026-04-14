'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DesktopAdFrame } from '@/components/ads/DesktopAdFrame';
import { Sidebar } from './Sidebar';
import { BottomNav } from './bottom-nav';

const NO_SHELL_PATHS = [
  '/lp', '/login', '/signup', '/reset-password', '/auth',
  '/privacy', '/terms', '/tokusho', '/contact', '/features', '/pricing',
  '/offline', '/share-target', '/admin',
];

const HIDE_BOTTOM_NAV_PATHS = [
  '/project/', '/share/', '/quiz/', '/quiz2/', '/flashcard/',
  '/quick-response/', '/sentence-quiz/', '/scan/confirm',
  '/subscription', '/collections/new', '/word/',
];

const DESKTOP_AD_PLACEMENTS = [
  {
    label: 'ホーム',
    matches: (pathname: string) => pathname === '/',
  },
  {
    label: '単語帳',
    matches: (pathname: string) =>
      pathname === '/projects' ||
      pathname.startsWith('/project/') ||
      pathname.startsWith('/word/'),
  },
  {
    label: '共有',
    matches: (pathname: string) =>
      pathname === '/shared' || pathname.startsWith('/share/'),
  },
  {
    label: '検索',
    matches: (pathname: string) => pathname === '/search',
  },
  {
    label: '進歩',
    matches: (pathname: string) => pathname === '/stats',
  },
  {
    label: '設定',
    matches: (pathname: string) => pathname === '/settings',
  },
];

function shouldHideShell(pathname: string): boolean {
  return NO_SHELL_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

function shouldHideBottomNav(pathname: string): boolean {
  if (pathname === '/subscription') return true;
  return HIDE_BOTTOM_NAV_PATHS.some(p => pathname.startsWith(p));
}

function getDesktopAdPlacement(pathname: string): string | null {
  const matchedPlacement = DESKTOP_AD_PLACEMENTS.find(({ matches }) =>
    matches(pathname)
  );
  return matchedPlacement?.label ?? null;
}

export function PersistentAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (shouldHideShell(pathname)) {
    return <>{children}</>;
  }

  const hideNav = shouldHideBottomNav(pathname);
  const desktopAdPlacement = getDesktopAdPlacement(pathname);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--color-background)' }}>
      <Sidebar />
      <div className="lg:ml-[280px] relative">
        {desktopAdPlacement ? (
          <DesktopAdFrame label={desktopAdPlacement}>{children}</DesktopAdFrame>
        ) : (
          children
        )}
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}
