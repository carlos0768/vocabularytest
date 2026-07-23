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
  '/guide', '/column',
  '/offline', '/share-target', '/admin',
  '/level-test', '/ops',
  '/tips',
  // 共有(公開)ページは自前で ds-app シェル(サイドバー付き)を描画するため、
  // 共通シェルを重ねるとサイドバーが二重表示になる。共通シェルを外す。
  '/shared/share-wordbook',
];

const HIDE_BOTTOM_NAV_PATHS = [
  '/project/', '/share/', '/quiz/', '/quiz2/', '/flashcard/',
  '/quick-response/', '/scan/confirm', '/shared/share-wordbook',
  '/subscription', '/collections/new', '/word/', '/favorites', '/profile', '/follows',
  '/groups/', '/reels',
  // 語法演習画面(/grammar/<bookId>)はナビ非表示。一覧(/grammar)は表示する。
  '/grammar/',
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
    let touchStartX = 0;
    let touchStartY = 0;
    let hasMoved = false;
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      hasMoved = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      // 縦・横どちらの移動もスクロールとみなす。横スクロール(本棚など)が縦しか
      // 見ていなかったため検知できず、iPad等で指を離した瞬間に下の単語帳が誤タップ
      // される不具合があった。動きを検知した時点でスクロール中から遮蔽オーバーレイを
      // 出しておき、指を離した瞬間の誤タップを確実に飲み込む。
      if (hasMoved) return;
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > 8 || dy > 8) {
        hasMoved = true;
        setScrollEnding(true);
      }
    };
    const handleTouchEnd = () => {
      clearTimeout(scrollTimeout);
      if (hasMoved) {
        // スクロール直後の誤タップを飲み込むため、少し遮蔽を残してから解除する
        scrollTimeout = setTimeout(() => setScrollEnding(false), 200);
      } else {
        // 実際のタップは通す
        setScrollEnding(false);
      }
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
