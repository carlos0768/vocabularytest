'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { SolidPanel } from '@/components/redesign/SolidPage';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];
function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

const COLLECTION = { id: 'c1', title: '英検対策セット', description: '英検準2級〜2級の対策用にまとめたコレクション' };

const BOOKS = [
  { id: 'p1', title: '英検準2級', total: 126, mastered: 64, learning: 38, newCount: 24 },
  { id: 'p2', title: '英検2級 頻出', total: 220, mastered: 98, learning: 72, newCount: 50 },
  { id: 'p3', title: '文法問題で出る単語', total: 194, mastered: 42, learning: 80, newCount: 72 },
];

export default function CollectionDetailPage() {
  const router = useRouter();
  const totalWords = BOOKS.reduce((s, b) => s + b.total, 0);
  const totalMastered = BOOKS.reduce((s, b) => s + b.mastered, 0);

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:pt-[54px]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-[14px] pb-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[var(--solid-ink)]"
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="flex-1 text-center font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">COLLECTION</div>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[var(--solid-ink)]">
          <Icon name="more_horiz" size={18} />
        </button>
      </div>

      {/* Collection info */}
      <div className="px-5 pb-4">
        <h1 className="font-display text-[22px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">{COLLECTION.title}</h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">{COLLECTION.description}</p>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="font-display text-[28px] font-extrabold tabular-nums text-[var(--solid-ink)]">{totalWords}</span>
          <span className="text-sm font-bold text-[var(--color-muted)]">語</span>
          <span className="ml-2 text-xs text-[var(--color-muted)]">({Math.round((totalMastered / totalWords) * 100)}% 習得)</span>
        </div>
      </div>

      {/* Books */}
      <div className="px-[18px] pb-3">
        <div className="mb-2 font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">
          {BOOKS.length} 冊の単語帳
        </div>
        <div className="flex flex-col gap-2.5">
          {BOOKS.map((b) => {
            const bg = thumbColor(b.id);
            return (
              <Link key={b.id} href={`/project/${b.id}`}>
                <SolidPanel
                  className="!rounded-[14px] ! transition-all duration-100 active:translate-x-px active:translate-y-px active:!"
                  faceClassName="!p-[13px]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-xl font-extrabold text-white"
                      style={{ background: bg }}
                    >
                      {b.title.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[var(--solid-ink)]">{b.title}</div>
                      <div className="mt-px flex items-baseline gap-0.5">
                        <span className="font-display text-lg font-extrabold tabular-nums text-[var(--solid-ink)]">{b.total}</span>
                        <span className="ml-px text-[11px] font-bold text-[var(--color-muted)]">語</span>
                      </div>
                      <div className="mt-[3px] flex gap-2.5">
                        <DotLabel color="var(--color-success)" label={`習得 ${b.mastered}`} />
                        <DotLabel color="var(--color-warning)" label={`学習 ${b.learning}`} />
                        <DotLabel color="rgba(26,26,26,0.2)" label={`未 ${b.newCount}`} />
                      </div>
                    </div>
                  </div>
                </SolidPanel>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DotLabel({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-[var(--color-muted)]">{label}</span>
    </span>
  );
}
