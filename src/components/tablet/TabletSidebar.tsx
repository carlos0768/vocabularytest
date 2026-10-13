'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { CreateWordbookSheet } from '@/components/home/CreateWordbookSheet';
import { DesktopWordSearchOverlay } from '@/components/desktop/DesktopWordSearchOverlay';
import { Icon } from '@/components/ui/Icon';
import { NavTabIcon } from '@/components/ui/NavTabIcon';
import { useAuth } from '@/hooks/use-auth';
import { useCoins } from '@/hooks/use-coins';
import { prefetchReelFeed } from '@/hooks/use-reel-feed';
import { getNavTabs, isNavTabActive } from '@/lib/navigation/tabs';
import { cn } from '@/lib/utils';

/**
 * タブレット (iPad) の左サイドバー。iPadOS のアプリと同じく常に見えていて、
 * 縦向き (tablet-compact) はアイコンだけの細いレール、横向き (tablet-regular) は
 * ラベル付きの幅広サイドバーになる (幅は tablet.css の --tablet-sidebar-w)。
 *
 * タブの定義と並びは src/lib/navigation/tabs.ts。ボトムナビ (phone) と
 * デスクトップヘッダーと同じ。tablet 以外では CSS で隠れる (hidden tablet:flex)。
 * タッチ前提: 行の高さは 48px 以上、hover でしか出ないものは置かない。
 */
export function TabletSidebar() {
  const pathname = usePathname();
  const { user, isPro } = useAuth();
  const { enabled: coinsEnabled, balance: coinBalance } = useCoins();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const tabs = getNavTabs(isPro);

  return (
    <aside className="tb-sidebar hidden tablet:flex" aria-label="ナビゲーション">
      <Link href="/" className="tb-sidebar-brand" aria-label="MERKEN ホーム">
        <span className="tb-sidebar-brand-full">
          MERKEN<span className="dot" />
        </span>
        <span className="tb-sidebar-brand-mark" aria-hidden="true">
          M<span className="dot" />
        </span>
      </Link>

      <nav className="tb-sidebar-nav">
        {tabs.map((tab) => {
          if (tab.primary) {
            return (
              <button
                key={tab.key}
                type="button"
                className="tb-sidebar-create"
                onClick={() => setCreateOpen(true)}
                aria-label="新しい単語帳を作成"
              >
                <span className="tb-sidebar-create-icon">
                  <NavTabIcon path={tab.iconPath} size={26} />
                </span>
                <span className="tb-sidebar-label">{tab.label}</span>
              </button>
            );
          }
          const active = isNavTabActive(tab, pathname);
          return (
            <Link
              key={tab.key}
              href={tab.href!}
              className={cn('tb-sidebar-item', active && 'active')}
              aria-current={active ? 'page' : undefined}
              onPointerDown={tab.key === 'reels' ? () => prefetchReelFeed() : undefined}
            >
              <span className="tb-sidebar-icon">
                <NavTabIcon path={tab.iconPath} filled={active && Boolean(tab.fillWhenActive)} size={24} />
              </span>
              <span className="tb-sidebar-label">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="tb-sidebar-footer">
        {user && (
          <button
            type="button"
            className="tb-sidebar-item tb-sidebar-tool"
            onClick={() => setSearchOpen(true)}
            aria-label="自分の単語帳から単語を検索"
          >
            <span className="tb-sidebar-icon">
              <Icon name="search" size={22} />
            </span>
            <span className="tb-sidebar-label">単語を検索</span>
          </button>
        )}
        {coinsEnabled && isPro && (
          <Link
            href="/coins"
            className="tb-sidebar-item tb-sidebar-tool"
            aria-label={`コイン残高 ${coinBalance.totalRemaining}枚`}
          >
            <span className="tb-sidebar-icon">
              <Icon name="toll" size={22} />
            </span>
            <span className="tb-sidebar-label tb-sidebar-coins">
              <span className="n">{coinBalance.totalRemaining}</span>
              <span className="u">枚</span>
            </span>
          </Link>
        )}
      </div>

      {/* 「作成」: ボトムナビと同じ作成フローを中央モーダルで出す */}
      <CreateWordbookSheet isOpen={createOpen} onClose={() => setCreateOpen(false)} variant="modal" />
      {/* 単語検索。開くたびにマウントし直して状態を初期化する */}
      {searchOpen && user && <DesktopWordSearchOverlay onClose={() => setSearchOpen(false)} userId={user.id} />}
    </aside>
  );
}
