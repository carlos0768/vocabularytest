'use client';

import { useStatsSync } from '@/hooks/use-stats-sync';

/**
 * Transparent component that activates stats sync for Pro users.
 * Mount once in the root layout.
 */
export function StatsSync() {
  useStatsSync();
  return null;
}
