'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCachedTotalWords, getHasLoaded, subscribeCacheUpdate } from '@/lib/home-cache';
import { useAuth } from './use-auth';

interface WordCountState {
  count: number;
  loading: boolean;
}

// Hook for tracking total word count.
// Strategy: reads from home-cache instead of making independent DB queries.
// Note: there is no Free-tier word limit anymore — data lives in IndexedDB
// (or Supabase for Pro) without an enforced cap.
export function useWordCount() {
  const { loading: authLoading } = useAuth();
  const cacheReady = getHasLoaded();

  const [state, setState] = useState<WordCountState>(() => {
    if (cacheReady) {
      return { count: getCachedTotalWords(), loading: false };
    }
    return { count: 0, loading: true };
  });

  // Subscribe to cache updates from loadProjects
  useEffect(() => {
    const unsubscribe = subscribeCacheUpdate(() => {
      setState({ count: getCachedTotalWords(), loading: false });
    });

    // Also sync when auth finishes and cache is already ready
    if (!authLoading && getHasLoaded()) {
      setState({ count: getCachedTotalWords(), loading: false });
    }

    return unsubscribe;
  }, [authLoading]);

  // Refresh function - triggers a re-read from cache
  // The actual data refresh should be done by invalidating + reloading home cache
  const refresh = useCallback(() => {
    if (getHasLoaded()) {
      setState({ count: getCachedTotalWords(), loading: false });
    }
  }, []);

  return {
    ...state,
    refresh,
  };
}
