'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReelFeedback, ReelItem } from '@/lib/reels/types';
import { triggerHaptic } from '@/lib/haptics';
import { getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';
import { ReelActionRail } from './ReelActionRail';
import { ReelBookCard } from './ReelBookCard';
import { ReelCommentSheet } from './ReelCommentSheet';
import { ReelMeaningPanel } from './ReelMeaningPanel';
import { ReelMoreSheet } from './ReelMoreSheet';

type ReelCardProps = {
  item: ReelItem;
  active: boolean;
  importing: boolean;
  onLike: () => void;
  onImport: () => void;
  onShare: () => void;
  onFeedback: (feedback: ReelFeedback) => void;
  onCommentCountChange: (delta: number) => void;
  onRevealed?: () => void;
};

const SWIPE_THRESHOLD = 80;

function speak(english: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(english);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

/**
 * One full-height reel card. The front face shows English + IPA only;
 * a horizontal swipe (or tap / ←→ keys on the active card) slides to
 * the Japanese meaning face, mirroring the flashcard axis-lock gesture.
 */
export function ReelCard({
  item,
  active,
  importing,
  onLike,
  onImport,
  onShare,
  onFeedback,
  onCommentCountChange,
  onRevealed,
}: ReelCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  // Reset to the English face whenever the card leaves the viewport
  // (adjust-state-during-render pattern; avoids an extra effect pass).
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (!active) {
      setRevealed(false);
      setDragX(0);
    }
  }

  const toggleReveal = (next: boolean) => {
    setRevealed(next);
    if (next) onRevealed?.();
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
      if (dragX < -SWIPE_THRESHOLD && !revealed) {
        toggleReveal(true);
        triggerHaptic();
      } else if (dragX > SWIPE_THRESHOLD && revealed) {
        toggleReveal(false);
        triggerHaptic();
      }
    }
    setDragX(0);
    setTimeout(() => {
      isSwiping.current = false;
    }, 50);
  };

  const handleTap = () => {
    if (!isSwiping.current) toggleReveal(!revealed);
  };

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setRevealed(true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setRevealed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  const baseOffset = revealed ? -50 : 0;
  const dragPercent = typeof window !== 'undefined' ? (dragX / window.innerWidth) * 50 : 0;
  const clampedDrag = Math.max(-50, Math.min(50, dragPercent));
  const trackOffset = Math.max(-50, Math.min(0, baseOffset + clampedDrag));

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Swipeable face track */}
      <div
        className="min-h-0 flex-1"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
      >
        <div
          className="flex h-full w-[200%]"
          style={{
            transform: `translateX(${trackOffset}%)`,
            transition: dragX === 0 ? 'transform 200ms ease-out' : 'none',
          }}
        >
          {/* Front: English + IPA only */}
          <div className="flex h-full w-1/2 flex-col items-center justify-center gap-4 px-8 text-center">
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
          <div className="h-full w-1/2">
            <ReelMeaningPanel item={item} />
          </div>
        </div>
      </div>

      {/* Right action rail */}
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <div className="pointer-events-auto">
          <ReelActionRail
            item={item}
            onLike={onLike}
            onSpeak={() => speak(item.english)}
            onComment={() => setCommentsOpen(true)}
            onShare={onShare}
            onMore={() => setMoreOpen(true)}
          />
        </div>
      </div>

      {/* Bottom attribution + import (Spotify-style) */}
      <div className="flex-shrink-0 px-4 pb-3">
        <ReelBookCard book={item.book} importing={importing} onImport={onImport} />
      </div>

      {/* "..." menu: interested / not-interested feedback */}
      <ReelMoreSheet
        item={item}
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        onFeedback={(feedback) => {
          setMoreOpen(false);
          onFeedback(feedback);
        }}
      />
      <ReelCommentSheet
        item={item}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={onCommentCountChange}
      />
    </div>
  );
}
