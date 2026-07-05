export type ReelFeedEntry<T> =
  | { kind: 'item'; item: T }
  | { kind: 'ad'; adKey: string };

export const REEL_AD_INTERVAL = 6;

/**
 * Interleave ad entries into the reel feed: one ad before every
 * `interval`-th item, never as the very first card. With ads disabled the
 * items pass through untouched.
 */
export function interleaveReelAds<T>(
  items: T[],
  adsEnabled: boolean,
  interval: number = REEL_AD_INTERVAL,
): ReelFeedEntry<T>[] {
  if (!adsEnabled || interval < 1) {
    return items.map((item) => ({ kind: 'item', item }));
  }

  const entries: ReelFeedEntry<T>[] = [];
  items.forEach((item, index) => {
    if (index > 0 && index % interval === 0) {
      entries.push({ kind: 'ad', adKey: `ad-${index / interval}` });
    }
    entries.push({ kind: 'item', item });
  });
  return entries;
}
