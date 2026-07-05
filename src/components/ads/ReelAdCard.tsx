'use client';

import { useEffect, useRef } from 'react';
import {
  ADSENSE_CLIENT_ID,
  ADSENSE_DISPLAY_ADS_ENABLED,
} from '@/lib/adsense';

const REELS_INFEED_SLOT =
  process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_REELS_INFEED_SLOT?.trim() ?? '';
const SHOW_PLACEHOLDER =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_SHOW_PLACEHOLDERS === '1';

const IS_CONFIGURED = Boolean(
  ADSENSE_DISPLAY_ADS_ENABLED && ADSENSE_CLIENT_ID && REELS_INFEED_SLOT,
);

// The feed only interleaves ad entries when a card would actually render —
// otherwise an empty full-screen snap slot appears mid-feed.
export const REEL_AD_CARD_AVAILABLE = IS_CONFIGURED || SHOW_PLACEHOLDER;

/**
 * Full-screen ad card for the vertical reel feed. One card = one snap slot,
 * same as a word card. Rendered windowed like the other cards; each mount is
 * a fresh <ins>, so the adsbygoogle push runs once per mount.
 */
export function ReelAdCard() {
  const adRef = useRef<HTMLModElement | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!IS_CONFIGURED || !adRef.current || pushedRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (error) {
      console.error('Failed to initialize reel in-feed ad', error);
    }
  }, []);

  if (!IS_CONFIGURED && !SHOW_PLACEHOLDER) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--color-surface)] px-5">
      <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-1 text-[10px] font-semibold tracking-[0.28em] text-[var(--color-muted)]">
        AD
      </span>
      {IS_CONFIGURED ? (
        <ins
          ref={adRef}
          className="adsbygoogle block w-full"
          style={{ display: 'block', width: '100%', minHeight: 250, maxHeight: '70%' }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={REELS_INFEED_SLOT}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <div className="flex h-[60%] w-full flex-col items-center justify-center rounded-[20px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-center">
          <p className="text-sm font-bold text-[var(--color-foreground)]">広告</p>
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">
            リール内広告プレースホルダ
          </p>
        </div>
      )}
      <p className="text-[11px] text-[var(--color-muted)]">スワイプして学習を続ける</p>
    </div>
  );
}
