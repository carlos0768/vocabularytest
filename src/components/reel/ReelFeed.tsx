'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReelBook, ReelFeedback, ReelItem } from '@/lib/reels/types';
import { ReelCard } from './ReelCard';
import { ReelEndCard, ReelLimitCard } from './ReelStatusCards';

type ReelFeedProps = {
  items: ReelItem[];
  hasMore: boolean;
  limitReached: boolean;
  usageLimit: number | null;
  importingBookId: string | null;
  onLoadMore: () => void;
  onLike: (item: ReelItem) => void;
  onImport: (book: ReelBook) => void;
  onShare: (item: ReelItem) => void;
  onFeedback: (item: ReelItem, feedback: ReelFeedback) => void;
  onCommentCountChange: (item: ReelItem, delta: number) => void;
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
  onLoadMore,
  onLike,
  onImport,
  onShare,
  onFeedback,
  onCommentCountChange,
}: ReelFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const observeCard = useCallback((node: HTMLDivElement | null) => {
    if (!node || !observerRef.current) return;
    observerRef.current.observe(node);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
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
    // Re-arm when the item count changes so new cards get observed.
  }, [items.length]);

  useEffect(() => {
    if (hasMore && items.length > 0 && activeIndex >= items.length - PREFETCH_AHEAD) {
      onLoadMore();
    }
  }, [activeIndex, hasMore, items.length, onLoadMore]);

  return (
    <div
      ref={containerRef}
      className="no-scrollbar h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          ref={observeCard}
          data-reel-index={index}
          className="h-full w-full snap-start"
        >
          {Math.abs(index - activeIndex) <= RENDER_WINDOW ? (
            <ReelCard
              item={item}
              active={index === activeIndex}
              importing={importingBookId === item.book.id}
              onLike={() => onLike(item)}
              onImport={() => onImport(item.book)}
              onShare={() => onShare(item)}
              onFeedback={(feedback) => onFeedback(item, feedback)}
              onCommentCountChange={(delta) => onCommentCountChange(item, delta)}
            />
          ) : null}
        </div>
      ))}
      {limitReached && (
        <div className="h-full w-full snap-start">
          <ReelLimitCard limit={usageLimit} />
        </div>
      )}
      {!limitReached && !hasMore && items.length > 0 && (
        <div className="h-full w-full snap-start">
          <ReelEndCard />
        </div>
      )}
    </div>
  );
}
