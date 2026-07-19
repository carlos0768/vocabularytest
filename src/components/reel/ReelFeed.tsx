'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReelBook } from '@/lib/reels/types';
import type { ReelFeedItem } from '@/hooks/use-reel-feed';
import { interleaveReelAds } from '@/lib/reels/feed-entries';
import { ReelAdCard, REEL_AD_CARD_AVAILABLE } from '@/components/ads/ReelAdCard';
import { ReelCard } from './ReelCard';
import { ReelLimitCard } from './ReelStatusCards';

type ReelFeedProps = {
  items: ReelFeedItem[];
  hasMore: boolean;
  limitReached: boolean;
  usageLimit: number | null;
  importingBookId: string | null;
  showAds?: boolean;
  onLoadMore: () => void;
  onImport: (book: ReelBook) => void;
};

const RENDER_WINDOW = 2;
const PREFETCH_AHEAD = 3;

/**
 * Vertical snap-scroll feed. Native momentum scrolling with
 * scroll-snap; IntersectionObserver tracks the active card and windows
 * rendering to active ± RENDER_WINDOW.
 */
export function ReelFeed({
  items,
  hasMore,
  limitReached,
  usageLimit,
  importingBookId,
  showAds = false,
  onLoadMore,
  onImport,
}: ReelFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const entries = useMemo(
    () => interleaveReelAds(items, showAds && REEL_AD_CARD_AVAILABLE),
    [items, showAds],
  );

  const observeCard = useCallback((node: HTMLDivElement | null) => {
    if (!node || !observerRef.current) return;
    observerRef.current.observe(node);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.reelIndex);
            if (Number.isFinite(index)) setActiveIndex(index);
          }
        }
      },
      { root: container, threshold: 0.6 },
    );
    observerRef.current = observer;
    for (const node of container.querySelectorAll('[data-reel-index]')) {
      observer.observe(node);
    }
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
    // Re-arm when the card count changes so new cards get observed.
  }, [entries.length]);

  useEffect(() => {
    if (hasMore && entries.length > 0 && activeIndex >= entries.length - PREFETCH_AHEAD) {
      onLoadMore();
    }
  }, [activeIndex, hasMore, entries.length, onLoadMore]);

  return (
    <div
      ref={containerRef}
      className="no-scrollbar h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
    >
      {entries.map((entry, index) => (
        <div
          key={entry.kind === 'item' ? entry.item.feedKey : entry.adKey}
          ref={observeCard}
          data-reel-index={index}
          className="h-full w-full snap-start"
        >
          {Math.abs(index - activeIndex) <= RENDER_WINDOW ? (
            entry.kind === 'item' ? (
              <ReelCard
                item={entry.item}
                active={index === activeIndex}
                importing={importingBookId === entry.item.book.id}
                onImport={() => onImport(entry.item.book)}
              />
            ) : (
              <ReelAdCard />
            )
          ) : null}
        </div>
      ))}
      {limitReached && (
        <div className="h-full w-full snap-start">
          <ReelLimitCard limit={usageLimit} />
        </div>
      )}
    </div>
  );
}
