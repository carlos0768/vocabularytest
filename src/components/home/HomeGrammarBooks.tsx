'use client';

/**
 * ホームの語法問題集セクション（グループ表示の上に配置）。
 * 単語帳と同じ正方形の本棚タイルを横スクロールで並べる。
 * - HomeGrammarBooksSection: モバイル向け。横スライドの正方形タイル
 * - DesktopHomeGrammarBooks: デスクトップ向け。ホームの2カラム (バインダーの隣) に置く 150px タイル列
 * 語法問題集はPro限定のため、問題集が0件（Free含む）のときは何も表示しない。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { desktopThumbColor, desktopUpdatedLabel } from '@/components/desktop/desktop-data';
import type { GrammarBook } from '@/components/desktop/DesktopGrammar';

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function HomeGrammarBooksSection({ books }: { books: GrammarBook[] }) {
  if (books.length === 0) return null;

  return (
    <div className="pb-1 pt-3">
      <div className="mb-2.5 flex items-center gap-2 px-[18px]">
        <Icon name="menu_book" size={20} className="text-[var(--solid-ink)]" />
        <h2 className="font-display text-[18px] font-black tracking-tight text-[var(--solid-ink)]">語法問題集</h2>
        <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[var(--solid-ink)] px-1.5 font-mono text-[11px] font-extrabold tabular-nums text-white">
          {books.length}
        </span>
        <Link href="/grammar" className="ml-auto flex items-center gap-[3px] text-[13px] font-semibold text-[var(--color-accent)]">
          すべて見る
          <Icon name="chevron_right" size={11} />
        </Link>
      </div>
      {/* マイ単語帳と同じ正方形タイルの横スクロール棚 */}
      <div className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[18px] pb-1 scroll-pl-[18px]">
        {books.map((book) => (
          <Link
            key={book.id}
            href={`/grammar/${book.id}/list`}
            className="relative flex aspect-square w-[42%] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] p-3 text-white shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)]"
            style={{ backgroundColor: desktopThumbColor(book.id) }}
          >
            <div className="absolute inset-y-0 left-0 w-[6px] bg-[rgba(0,0,0,0.22)]" />
            <div className="line-clamp-2 pl-1.5 font-display text-[13.5px] font-bold leading-snug drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
              {book.title}
            </div>
            <div className="pl-1.5">
              <div className="flex items-center gap-1 drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
                <Icon name="menu_book" size={14} />
                <span className="font-mono text-[9.5px] font-bold tracking-[0.04em]">GRAMMAR</span>
              </div>
              <div className="mt-1 font-mono text-[9px] tracking-[0.04em] opacity-90">
                更新 {formatUpdated(book.updatedAt)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DesktopHomeGrammarBooks({ books }: { books: GrammarBook[] }) {
  if (books.length === 0) return null;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 12px' }}>
        <Icon name="menu_book" size={20} style={{ color: 'var(--color-ink)' }} />
        <h2 className="ds-h2" style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>語法問題集</h2>
        <span className="ds-count-badge">{books.length}</span>
        <Link href="/grammar" className="ds-see-all" style={{ marginLeft: 'auto' }}>
          すべて見る
          <Icon name="chevron_right" />
        </Link>
      </div>
      {/* マイ単語帳と同じ ds-book タイル (150px) を横に並べる */}
      <div className="ds-tile-row">
        {books.map((book) => (
          <Link
            key={book.id}
            href={`/grammar/${book.id}/list`}
            className="ds-book"
            style={{ background: desktopThumbColor(book.id) }}
          >
            <div className="bk-spine" />
            <div className="bk-title" style={{ paddingLeft: 0 }}>{book.title}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="menu_book" style={{ fontSize: 14 }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>GRAMMAR</span>
              </div>
              <div className="bk-foot">更新 {desktopUpdatedLabel(book.updatedAt)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
