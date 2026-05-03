'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SolidPanel } from '@/components/redesign/SolidPage';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];
function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

const COLLECTIONS = [
  { id: 'c1', title: '英検対策セット', books: 3, totalWords: 540 },
  { id: 'c2', title: '大学受験まとめ', books: 5, totalWords: 820 },
  { id: 'c3', title: 'TOEIC 対策', books: 2, totalWords: 380 },
];

export default function CollectionsPage() {
  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-[54px] font-[var(--font-body)]">
      {/* Header */}
      <div className="flex items-baseline justify-between px-5 pb-3 pt-2">
        <div>
          <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">LIBRARY</div>
          <h1 className="font-display text-[22px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">コレクション</h1>
        </div>
        <Link href="/collections/new" className="flex items-center gap-[3px] text-[13px] font-semibold text-[var(--color-accent)]">
          新規作成
          <Icon name="add" size={13} />
        </Link>
      </div>

      {/* Collection list */}
      <div className="flex flex-col gap-2.5 px-[18px]">
        {COLLECTIONS.map((c) => {
          const bg = thumbColor(c.id);
          return (
            <Link key={c.id} href={`/collections/${c.id}`}>
              <SolidPanel
                className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:!shadow-[1px_1px_0_var(--solid-ink)]"
                faceClassName="!p-[13px]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] font-display text-xl font-extrabold text-white"
                    style={{ background: bg }}
                  >
                    {c.title.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[var(--solid-ink)]">{c.title}</div>
                    <div className="mt-px flex items-baseline gap-1">
                      <span className="font-display text-lg font-extrabold tabular-nums text-[var(--solid-ink)]">{c.totalWords}</span>
                      <span className="text-[11px] font-bold text-[var(--color-muted)]">語</span>
                    </div>
                    <div className="mt-[3px] text-[10px] text-[var(--color-muted)]">{c.books} 冊の単語帳</div>
                  </div>
                  <Icon name="chevron_right" size={16} className="text-[var(--color-muted)]" />
                </div>
              </SolidPanel>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
