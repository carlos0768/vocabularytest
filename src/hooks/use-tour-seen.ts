'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_PREFIX = 'merken.tour.';

// Cross-hook notification so that calling markSeen() (or seeing the tour in one
// place) updates every mounted useTourSeen consumer without a storage event.
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function emit() {
  for (const callback of listeners) callback();
}

function readSeen(key: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === '1';
  } catch {
    // localStorage can throw in private/restricted contexts — fail closed
    // (treat as seen so the tour never appears) rather than crash.
    return true;
  }
}

export interface UseTourSeenResult {
  /**
   * True only on the client when the tour has not yet been seen on this device.
   * False during SSR / first paint to avoid hydration flashes and to keep
   * react-joyride off the server tree.
   */
  shouldRender: boolean;
  /** Persist the "seen" flag for this device and stop rendering the tour. */
  markSeen: () => void;
}

/**
 * Tracks whether a one-time guided tour has already been shown on this device.
 *
 * Persistence is intentionally per-device via localStorage (no DB migration):
 * an onboarding coach-mark only needs to be shown once per browser, and this
 * keeps the feature isolated from the DB-backed `onboarding_step` funnel.
 */
export function useTourSeen(key: string): UseTourSeenResult {
  const seen = useSyncExternalStore(
    subscribe,
    () => readSeen(key),
    () => true,
  );

  const markSeen = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_PREFIX + key, '1');
      } catch {
        // Ignore persistence failures; emit() still hides the tour in-memory.
      }
    }
    emit();
  }, [key]);

  return { shouldRender: !seen, markSeen };
}
