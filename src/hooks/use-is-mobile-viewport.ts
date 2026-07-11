'use client';

import { useSyncExternalStore } from 'react';

// Matches Tailwind's `lg` breakpoint (1024px). The app renders a desktop view
// plus a separate `lg:hidden` mobile tree; guided-tour anchors live only in the
// mobile tree, so tours must be gated to this viewport.
const MOBILE_QUERY = '(max-width: 1023px)';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * True when the mobile (`lg:hidden`) layout is the active one. SSR-safe:
 * returns false on the server to avoid hydration mismatches.
 */
export function useIsMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
