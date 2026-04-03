'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { BottomNav } from './bottom-nav';

const NO_SHELL_PATHS = [
  '/lp', '/login', '/signup', '/reset-password', '/auth',
  '/privacy', '/terms', '/contact', '/features', '/pricing',
  '/offline', '/share-target', '/admin',
];

const HIDE_BOTTOM_NAV_PATHS = [
  '/project/', '/share/', '/quiz/', '/quiz2/', '/flashcard/',
  '/quick-response/', '/sentence-quiz/', '/scan/confirm',
  '/subscription', '/collections/new',
];

function shouldHideShell(pathname: string): boolean {
  return NO_SHELL_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

function shouldHideBottomNav(pathname: string): boolean {
  if (pathname === '/subscription') return true;
  return HIDE_BOTTOM_NAV_PATHS.some(p => pathname.startsWith(p));
}

export function PersistentAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (shouldHideShell(pathname)) {
    return <>{children}</>;
  }

  const hideNav = shouldHideBottomNav(pathname);

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--color-background)' }}>
      <Sidebar />
      <div className="lg:ml-[280px] relative">
        {children}
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}
