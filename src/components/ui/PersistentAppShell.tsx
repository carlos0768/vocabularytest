'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DesktopAdFrame } from '@/components/ads/DesktopAdFrame';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from './Sidebar';
import { BottomNav } from './bottom-nav';

const NO_SHELL_PATHS = [
  '/lp', '/login', '/signup', '/reset-password', '/auth',
  '/privacy', '/terms', '/tokusho', '/contact', '/features', '/pricing',
  '/offline', '/share-target', '/admin',
];

const HIDE_BOTTOM_NAV_PATHS = [
  '/project/', '/share/', '/quiz/', '/quiz2/', '/flashcard/',
  '/quick-response/', '/scan/confirm',
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
  {
    label: 'コレクション',
    matches: (pathname: string) => pathname === '/collections' || pathname.startsWith('/collections/'),
  },
  {
    label: '保存済み',
    matches: (pathname: string) => pathname === '/favorites' || pathname.startsWith('/favorites/'),
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
  const { user, loading: authLoading } = useAuth();
  const [scrollEnding, setScrollEnding] = useState(false);

  useEffect(() => {
    let touchStartY = 0;
    let hasMoved = false;
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      hasMoved = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (Math.abs(e.touches[0].clientY - touchStartY) > 8) hasMoved = true;
    };
    const handleTouchEnd = () => {
      if (!hasMoved) return;
      setScrollEnding(true);
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => setScrollEnding(false), 160);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const isGuestHome = pathname === '/' && !authLoading && !user;

  if (shouldHideShell(pathname) || isGuestHome) {
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
      {scrollEnding && (
        <div
          className="fixed inset-0 z-[9998]"
          style={{ touchAction: 'none', pointerEvents: 'auto' }}
          aria-hidden
        />
      )}
    </div>
  );
}
