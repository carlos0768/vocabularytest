'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DesktopSidebar } from '@/components/desktop/DesktopChrome';
import { useAuth } from '@/hooks/use-auth';
import { BottomNav } from './bottom-nav';

const SIDEBAR_STORAGE_KEY = 'merken-sidebar-collapsed';

const NO_SHELL_PATHS = [
  '/lp', '/login', '/signup', '/reset-password', '/auth',
  '/privacy', '/terms', '/tokusho', '/contact', '/features', '/pricing',
  '/offline', '/share-target', '/admin',
];

const HIDE_BOTTOM_NAV_PATHS = [
  '/project/', '/share/', '/quiz/', '/quiz2/', '/flashcard/',
  '/quick-response/', '/scan/confirm',
  '/subscription', '/collections/new', '/word/', '/favorites', '/profile', '/follows',
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
  const { user } = useAuth();
  const [scrollEnding, setScrollEnding] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

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

  const isGuestHome = pathname === '/' && !user;

  if (shouldHideShell(pathname) || isGuestHome) {
    return <>{children}</>;
  }

  const hideNav = shouldHideBottomNav(pathname);

  return (
    <div className={`ds-live-shell relative${sidebarCollapsed ? ' ds-live-shell--collapsed' : ''}`}>
      <DesktopSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="ds-live-main relative">
        {children}
      </div>
      {!hideNav && <div className="lg:hidden"><BottomNav /></div>}
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
