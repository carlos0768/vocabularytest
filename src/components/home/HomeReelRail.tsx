'use client';

/**
 * ホームに流すリールのおすすめレール（Spotify のエピソードカード風の
 * 縦長カード横スクロール）。表示されるのは語源（morphology）がある単語
 * だけ（/api/home/recommendations 側で保証）。タップで /reels へ。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { triggerHaptic } from '@/lib/haptics';
import type { HomeReelPreviewItem } from '@/lib/home/recommendations-types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

const MAX_FORMULA_PARTS = 4;

export function HomeReelRail({ items, loading }: { items: HomeReelPreviewItem[]; loading: boolean }) {
  if (!loading && items.length === 0) return null;

  return (
    <div className="pb-2 pt-4">
      <div className="flex items-baseline justify-between px-5 pb-2.5">
        <div>
          <div className="font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--color-muted)]">
            REELS
          </div>
          <h2 className="font-display text-[19px] font-extrabold tracking-[-0.01em] text-[var(--solid-ink)]">
            おすすめのリール
          </h2>
        </div>
        <Link
          href="/reels"
          className="flex items-center gap-[3px] text-[13px] font-semibold text-[var(--color-accent)]"
        >
          すべて見る
          <Icon name="chevron_right" size={11} />
        </Link>
      </div>

      <div className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto px-[18px] pb-1">
        {loading && items.length === 0
          ? [0, 1, 2].map((slot) => (
              <div
                key={slot}
                className="h-[190px] w-[140px] shrink-0 animate-pulse rounded-[14px] border-2 border-[rgba(26,26,26,0.12)] bg-[var(--color-surface-secondary)]"
              />
            ))
          : items.map((item) => <ReelPreviewCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

function ReelPreviewCard({ item }: { item: HomeReelPreviewItem }) {
  const parts = item.morphology.formula.slice(0, MAX_FORMULA_PARTS);
  return (
    <Link
      href="/reels"
      onPointerDown={() => triggerHaptic()}
      aria-label={`リールで${item.english}を見る`}
      className="relative flex h-[190px] w-[140px] shrink-0 snap-start flex-col overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] p-3 text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
      style={{ background: `linear-gradient(165deg, ${thumbColor(item.id)} 0%, #1a1a1a 170%)` }}
    >
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-white/20 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.04em]">
          語源
        </span>
        <Icon name="play_arrow" size={16} filled className="text-white/80" />
      </div>

      <div className="mt-auto min-w-0">
        <div className="break-words font-display text-[18px] font-extrabold leading-tight">
          {item.english}
        </div>
        <div className="mt-0.5 truncate text-[11px] font-bold text-white/85">{item.japanese}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {parts.map((part, index) => (
            <span key={`${part.text}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 && <span className="text-[10px] font-bold text-white/60">+</span>}
              <span className="rounded-[6px] bg-white/20 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                {part.text}
              </span>
            </span>
          ))}
        </div>
        <div className="mt-1.5 truncate text-[9px] font-bold text-white/60">{item.bookTitle}</div>
      </div>
    </Link>
  );
}
