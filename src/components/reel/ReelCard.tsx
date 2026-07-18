'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReelItem } from '@/lib/reels/types';
import { triggerHaptic } from '@/lib/haptics';
import { getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';
import { ReelBookCard } from './ReelBookCard';
import { ReelEtymologyPanel } from './ReelEtymologyPanel';
import { ReelMeaningPanel } from './ReelMeaningPanel';

type ReelCardProps = {
  item: ReelItem;
  active: boolean;
  importing: boolean;
  onImport: () => void;
  onRevealed?: () => void;
};

const SWIPE_THRESHOLD = 80;

/**
 * One full-height reel card.
 *
 * - Cards WITH cached etymology (語源) show a single consolidated page —
 *   English + pronunciation, translation and etymology together, no flip.
 * - Cards WITHOUT etymology keep the 2-face flashcard: the front shows
 *   English + IPA only, and a horizontal swipe (or tap / ←→ keys on the
 *   active card) reveals the meaning, mirroring the axis-lock gesture.
 */
export function ReelCard({
  item,
  active,
  importing,
  onImport,
  onRevealed,
}: ReelCardProps) {
  const [page, setPage] = useState(0);
  const [dragX, setDragX] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const hasMorphology = Boolean(
    item.morphology && !item.morphology.none && item.morphology.formula.length > 0,
  );
  // Etymology cards collapse to a single non-swipeable page; every other
  // card keeps the 2-face front(English)→back(meaning) flip.
  const faces = 2;
  const lastPage = faces - 1;
  const faceWidth = 100 / faces;

  // Reset to the English face whenever the card leaves the viewport
  // (adjust-state-during-render pattern; avoids an extra effect pass).
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (!active) {
      setPage(0);
      setDragX(0);
    }
  }

  const goToPage = (next: number) => {
    const clamped = Math.max(0, Math.min(lastPage, next));
    if (clamped !== 0 && page === 0) onRevealed?.();
    setPage(clamped);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    // Axis lock: only claim clearly-horizontal gestures so vertical
    // snap scrolling keeps its native momentum.
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true;
      setDragX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (isSwiping.current) {
      if (dragX < -SWIPE_THRESHOLD && page < lastPage) {
        goToPage(page + 1);
        triggerHaptic();
      } else if (dragX > SWIPE_THRESHOLD && page > 0) {
        goToPage(page - 1);
        triggerHaptic();
      }
    }
    setDragX(0);
    setTimeout(() => {
      isSwiping.current = false;
    }, 50);
  };

  // Tap cycles forward through faces (wrap to the front at the end),
  // preserving the old tap-to-toggle feel on 2-face cards.
  const handleTap = () => {
    if (!isSwiping.current) goToPage(page >= lastPage ? 0 : page + 1);
  };

  useEffect(() => {
    if (!active || hasMorphology) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPage(page + 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToPage(page - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, page, lastPage, hasMorphology]);

  const baseOffset = -faceWidth * page;
  const dragPercent = typeof window !== 'undefined' ? (dragX / window.innerWidth) * faceWidth : 0;
  const clampedDrag = Math.max(-faceWidth, Math.min(faceWidth, dragPercent));
  const trackOffset = Math.max(-faceWidth * lastPage, Math.min(0, baseOffset + clampedDrag));

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {hasMorphology ? (
        /* Etymology card: English + translation + etymology on one page */
        <div className="min-h-0 flex-1">
          <ReelEtymologyPanel item={item} />
        </div>
      ) : (
      /* Swipeable face track: front(English) then back(meaning) */
      <div
        className="min-h-0 flex-1"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
      >
        <div
          className="flex h-full"
          style={{
            width: `${faces * 100}%`,
            transform: `translateX(${trackOffset}%)`,
            transition: dragX === 0 ? 'transform 200ms ease-out' : 'none',
          }}
        >
          {/* Front: English + IPA only */}
          <div
            className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
            style={{ width: `${faceWidth}%` }}
          >
            {(item.partOfSpeechTags.length > 0 || item.isRecycled) && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {item.isRecycled && (
                  <span className="rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-light)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-accent-ink)]">
                    復習
                  </span>
                )}
                {item.partOfSpeechTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-secondary-text)]"
                  >
                    {getPartOfSpeechLabel(tag)}
                  </span>
                ))}
              </div>
            )}
            <p className="t-word-display break-words">{item.english}</p>
            <p className="font-mono text-base text-[var(--color-secondary-text)]">
              {item.pronunciation || ' '}
            </p>
            <p className="mt-4 text-xs text-[var(--color-muted)]">
              ← スワイプ / タップで意味を表示
            </p>
          </div>
          {/* Back: Japanese meaning */}
          <div className="h-full" style={{ width: `${faceWidth}%` }}>
            <ReelMeaningPanel item={item} />
          </div>
        </div>
      </div>
      )}

      {/* Bottom attribution + import (Spotify-style) */}
      <div className="flex-shrink-0 px-4 pb-3">
        <ReelBookCard book={item.book} importing={importing} onImport={onImport} />
      </div>
    </div>
  );
}
