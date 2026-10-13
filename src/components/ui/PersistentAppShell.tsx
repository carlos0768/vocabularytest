'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DesktopHeader } from '@/components/desktop/DesktopChrome';
import { TabletSidebar } from '@/components/tablet/TabletSidebar';
import { markClientNavigation, useAuth } from '@/hooks/use-auth';
import { createScrollStopTapGuard } from '@/lib/ui/scroll-stop-tap';
import { cn } from '@/lib/utils';
import { BottomNav } from './bottom-nav';

const NO_SHELL_PATHS = [
  '/lp', '/login', '/signup', '/reset-password', '/auth',
  // OAuth 登録者のプロフィール設定。/signup と同じ全画面ステップなのでシェルを外す。
  '/onboarding',
  '/privacy', '/terms', '/tokusho', '/contact', '/features', '/pricing',
  '/guide', '/column',
  '/offline', '/share-target', '/admin',
  '/level-test', '/ops',
  '/tips',
  // 共有(公開)ページは自前で ds-app シェル(ヘッダー付き)を描画するため、
  // 共通シェルを重ねるとヘッダーが二重表示になる。共通シェルを外す。
  '/shared/share-wordbook',
];

const HIDE_BOTTOM_NAV_PATHS = [
  '/project/', '/share/', '/quiz/', '/quiz2/', '/flashcard/',
  '/quick-response/', '/voice-quiz/', '/scan/confirm', '/shared/share-wordbook',
  '/subscription', '/collections/new', '/word/', '/favorites', '/follows',
  // 自分のプロフィール(/profile)はボトムナビのタブなのでナビを表示する。
  // 他ユーザーのプロフィール(/profile/<accountId>)は詳細画面なので非表示のまま。
  '/profile/',
  // グループは専用フロー（ハブ + 各機能ページ）なのでナビは出さない。
  '/groups', '/reels',
  // 対戦はロビーも含めて専用フロー（1画面に収める設計）なのでナビは出さない。
  '/battle',
  // 語法演習画面(/grammar/<bookId>)はナビ非表示。一覧(/grammar)は表示する。
  '/grammar/',
  // バインダー詳細は自前の固定下部バー（単語帳を追加/公開）を持つため、
  // 共通ボトムナビと二重に固定表示されないよう非表示にする。
  '/binder/',
  // 設定は戻るボタン付きの詳細画面なのでナビは出さない（配下の各設定ページも同様）。
  '/settings',
];

// デスクトップのヘッダー(ロゴ + ピル型タブ)を出さないパス。
// 単語帳詳細は画面上部に戻るボタン付きの自前ヘッダーを持つので、共通ヘッダーは重ねない。
// クイズ / フラッシュカードなどの学習画面は全画面 (ds-fixed-main) なので、ヘッダーが
// その上に被らないよう出さない。
const HIDE_DESKTOP_HEADER_PATHS = ['/project/', '/flashcard/', '/quiz/', '/quiz2/', '/quick-response/', '/voice-quiz/'];

// タブレットでサイドバーを出さず 1 カラムにするパス (全画面のフロー)。
// 学習画面は集中モード、グループ / 語法演習 / 対戦 / スキャン確認は
// `fixed inset-x-0 top-0 h-[100dvh]` の自前の全画面レイアウトを持つ。
// 単語帳詳細はタブレットでは専用ビュー (サイドバーあり) なので含めない。
const TABLET_IMMERSIVE_PATHS = [
  '/flashcard/', '/quiz/', '/quiz2/', '/quick-response/', '/voice-quiz/',
  '/battle', '/groups', '/grammar/', '/scan/confirm',
];

function shouldHideDesktopHeader(pathname: string): boolean {
  return HIDE_DESKTOP_HEADER_PATHS.some((p) => pathname.startsWith(p));
}

function isTabletImmersive(pathname: string): boolean {
  return TABLET_IMMERSIVE_PATHS.some((p) => pathname.startsWith(p));
}

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
  // 最初に描画したパスから変わったら「クライアント遷移済み」を useAuth に伝える。
  // このシェルは新しいページより先に描画されるので、遷移先のコンポーネントは
  // 最初のレンダーからログイン状態を持てる（render 中に立てる冪等なフラグ）。
  const [initialPathname] = useState(pathname);
  if (pathname !== initialPathname) {
    markClientNavigation();
  }
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let hasMoved = false;
    let scrollTimeout: ReturnType<typeof setTimeout>;
    // 慣性スクロールを止めるためのタップが click になる (iPad) のを防ぐ判定
    const stopTapGuard = createScrollStopTapGuard();

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      hasMoved = false;
      stopTapGuard.onTouchStart();
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
        stopTapGuard.onTouchMove();
        setScrollEnding(true);
      }
    };
    const handleTouchEnd = () => {
      clearTimeout(scrollTimeout);
      stopTapGuard.onTouchEnd(hasMoved);
      if (hasMoved) {
        // スクロール直後の誤タップを飲み込むため、少し遮蔽を残してから解除する
        scrollTimeout = setTimeout(() => setScrollEnding(false), 200);
      } else {
        // 実際のタップは通す
        setScrollEnding(false);
      }
    };
    const handleTouchCancel = () => {
      stopTapGuard.onTouchCancel();
    };
    // 本文 (.ds-live-main) も window も、どこがスクロールしても拾う
    const handleScroll = () => {
      stopTapGuard.onScroll();
    };
    // iPad: overflow コンテナの慣性スクロール中に指を置くと、止まるだけでなく
    // その場所に click まで飛び、指の下にあったリンクが開いてしまう (window が
    // スクロールするスマホでは起きない)。止めるためのタップだったと判定できた
    // 直後の click を 1 回だけ、React に届く前 (capture) で捨てる。
    const handleClickCapture = (e: MouseEvent) => {
      if (!stopTapGuard.shouldSuppressClick()) return;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    window.addEventListener('click', handleClickCapture, { capture: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
      document.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('click', handleClickCapture, { capture: true });
      clearTimeout(scrollTimeout);
    };
  }, []);

  const isGuestHome = pathname === '/' && !user;

  if (shouldHideShell(pathname) || isGuestHome) {
    return <>{children}</>;
  }

  const hideNav = shouldHideBottomNav(pathname);
  const hideDesktopHeader = shouldHideDesktopHeader(pathname);
  const tabletImmersive = isTabletImmersive(pathname);

  // 3 つのレイアウトのクローム。どれを出すかは CSS (<html data-layout>) が決める:
  //   phone   → 浮いた下部ナビ (BottomNav)
  //   tablet  → 左サイドバー (TabletSidebar, tablet.css)
  //   desktop → 上部ヘッダー (DesktopHeader, desktop.css)
  return (
    <div className={cn('ds-live-shell relative', tabletImmersive && 'ds-live-shell--immersive')}>
      {!hideDesktopHeader && <DesktopHeader />}
      {!tabletImmersive && <TabletSidebar />}
      <div className="ds-live-main relative">
        {children}
      </div>
      {!hideNav && <div className="desktop:hidden tablet:hidden"><BottomNav /></div>}
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
