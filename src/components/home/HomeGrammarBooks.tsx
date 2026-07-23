'use client';

/**
 * ホームの語法問題集セクション（グループ表示の上に配置）。
 * - HomeGrammarBooksSection: モバイル向け。横スライドのカードレール
 * - DesktopHomeGrammarBooks: デスクトップ向けカードグリッド
 * 語法問題集はPro限定のため、問題集が0件（Free含む）のときは何も表示しない。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { desktopUpdatedLabel } from '@/components/desktop/desktop-data';
import type { GrammarBook } from '@/components/desktop/DesktopGrammar';

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function HomeGrammarBooksSection({ books }: { books: GrammarBook[] }) {
  if (books.length === 0) return null;

  const multiple = books.length > 1;

  return (
    <div className="pb-1 pt-3">
      <div className="mb-2.5 flex items-center gap-2 px-[14px]">
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
      <div
        className={
          multiple
            ? 'no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[14px] pb-1 scroll-pl-[14px]'
            : 'px-[14px]'
        }
      >
        {books.map((book) => (
          <Link
            key={book.id}
            href={`/grammar/${book.id}`}
            className={`flex items-center gap-3 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-3 py-3 no-underline transition-all duration-100 active:translate-x-px active:translate-y-px ${
              multiple ? 'w-[82%] shrink-0 snap-start' : 'w-full'
            }`}
          >
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] border-2 border-[var(--solid-ink)] bg-[#faf7f1] text-[var(--solid-ink)]">
              <Icon name="menu_book" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[14.5px] font-bold text-[var(--solid-ink)]">{book.title}</span>
              <span className="mt-0.5 block font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
                更新 {formatUpdated(book.updatedAt)}
              </span>
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--color-muted)]">
              <Icon name="chevron_right" size={16} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DesktopHomeGrammarBooks({ books }: { books: GrammarBook[] }) {
  if (books.length === 0) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <div className="ds-sec-head" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2>語法問題集</h2>
          <span className="mono muted" style={{ fontSize: 12 }}>{books.length} 冊</span>
        </div>
        <Link href="/grammar" className="ds-btn ghost sm" style={{ textDecoration: 'none', fontSize: 13 }}>
          すべて表示
          <Icon name="chevron_right" style={{ fontSize: 16 }} />
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {books.slice(0, 6).map((book) => (
          <Link
            key={book.id}
            href={`/grammar/${book.id}`}
            className="ds-card"
            style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: 9,
                border: '2px solid var(--solid-ink)',
                background: '#faf7f1',
              }}
            >
              <Icon name="menu_book" style={{ fontSize: 18 }} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {book.title}
              </span>
              <span className="mono" style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: 'var(--color-muted)' }}>
                更新 {desktopUpdatedLabel(book.updatedAt)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
