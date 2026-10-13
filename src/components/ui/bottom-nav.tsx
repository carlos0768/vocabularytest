'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CreateWordbookSheet } from '@/components/home/CreateWordbookSheet';
import { NavTabIcon } from '@/components/ui/NavTabIcon';
import { useAuth } from '@/hooks/use-auth';
import { prefetchReelFeed } from '@/hooks/use-reel-feed';
import { getNavTabs, isNavTabActive } from '@/lib/navigation/tabs';

/**
 * スマホ (phone レイアウト) の浮いた下部ナビ。タブの定義と並びは
 * `src/lib/navigation/tabs.ts` が持ち、タブレットのサイドバー・デスクトップの
 * ヘッダーと共通。tablet / desktop では PersistentAppShell 側で出さない。
 */
export function BottomNav() {
  const pathname = usePathname();
  const { isPro } = useAuth();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const tabs = getNavTabs(isPro);

  return (
    <>
      <div
        className="desktop:hidden tablet:hidden"
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
            const active = isNavTabActive(tab, pathname);

            if (tab.primary) {
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setCreateSheetOpen(true)}
                  aria-label="作成"
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
                    <NavTabIcon path={tab.iconPath} size={26} />
                  </div>
                </button>
              );
            }

            return (
              <Link
                key={tab.key}
                href={tab.href!}
                aria-current={active ? 'page' : undefined}
                // リールはフィードAPIが重いので、タップした瞬間に初回ページの
                // 取得を先行開始して表示までの待ちを短縮する。
                onPointerDown={tab.key === 'reels' ? () => prefetchReelFeed() : undefined}
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
                <NavTabIcon path={tab.iconPath} filled={active && Boolean(tab.fillWhenActive)} />
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
