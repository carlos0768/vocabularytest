'use client';

/**
 * デスクトップ Spotify 風の共通部品。
 * - DesktopShelf: セクション見出し（タイトル + すべて表示）と横スクロールのカード列
 * - DesktopMediaCard: 正方形アートワーク + タイトル + サブタイトルのカード。
 *   共有ライブラリの共有単語帳などで使う。
 */

import Link from 'next/link';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

export function DesktopShelf({
  title,
  count,
  seeAllHref,
  onSeeAll,
  columns,
  children,
}: {
  title: string;
  count?: number;
  seeAllHref?: string;
  onSeeAll?: () => void;
  /** 1 行に表示する枚数。省略時は CSS の既定値（4枚） */
  columns?: number;
  children: ReactNode;
}) {
  return (
    <section className="ds-shelf">
      <div className="ds-shelf-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <h2>{title}</h2>
          {typeof count === 'number' && (
            <span className="mono muted" style={{ fontSize: 12 }}>{count}</span>
          )}
        </div>
        {seeAllHref ? (
          <Link href={seeAllHref} className="see-all">
            すべて表示
            <Icon name="chevron_right" style={{ fontSize: 15 }} />
          </Link>
        ) : onSeeAll ? (
          <button type="button" className="see-all" onClick={onSeeAll}>
            すべて表示
            <Icon name="chevron_right" style={{ fontSize: 15 }} />
          </button>
        ) : null}
      </div>
      <div
        className="ds-shelf-row"
        style={columns ? ({ '--shelf-cols': columns } as CSSProperties) : undefined}
      >
        {children}
      </div>
    </section>
  );
}

export function DesktopMediaCard({
  href,
  onClick,
  artStyle,
  artChildren,
  title,
  subtitle,
  playHref,
  playLabel,
}: {
  href?: string;
  /** stretch リンクのクリック時に呼ばれる（preventDefault + 独自遷移も可） */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  artStyle?: CSSProperties;
  artChildren?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** ホバー時に出す再生ボタンの遷移先（例: クイズ開始） */
  playHref?: string;
  playLabel?: string;
}) {
  return (
    <div className="ds-media-card">
      <div className="art" style={artStyle}>
        {artChildren}
        {playHref && (
          <Link href={playHref} className="play" aria-label={playLabel ?? `${title}を再生`}>
            <Icon name="play_arrow" size={22} filled />
          </Link>
        )}
      </div>
      <div className="meta">
        <div className="t">{title}</div>
        {subtitle != null && <div className="s">{subtitle}</div>}
      </div>
      {href && (
        // カード全面を覆うリンク（play ボタンは z-index で上に重なる）
        <Link href={href} className="stretch" aria-label={title} onClick={onClick} />
      )}
    </div>
  );
}
