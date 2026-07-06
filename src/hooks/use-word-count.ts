'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCachedTotalWords, getHasLoaded, subscribeCacheUpdate } from '@/lib/home-cache';
import { useAuth } from './use-auth';

interface WordCountState {
  count: number;
  limit: number;
  remaining: number;
  percentage: number;
  isNearLimit: boolean;  // 80% or more
  isAlmostFull: boolean; // 95% or more
  isAtLimit: boolean;    // 100%
  loading: boolean;
}

// The Free plan is limited by WORDBOOK count (FREE_WORDBOOK_LIMIT), not word
// count. This hook now only reports the total word count for display and never
// blocks adding words. Limit-related flags are inert (kept for compatibility
// with existing consumers).
function deriveState(totalWords: number, isLoading: boolean): WordCountState {
  return {
    count: totalWords,
    limit: Infinity,
    remaining: Infinity,
    percentage: 0,
    isNearLimit: false,
    isAlmostFull: false,
    isAtLimit: false,
    loading: isLoading,
  };
}

// Hook for tracking word count (for display only — no word cap).
// Strategy 1: Reads from home-cache instead of making independent DB queries
export function useWordCount() {
  const { loading: authLoading } = useAuth();
  const cacheReady = getHasLoaded();

  const [state, setState] = useState<WordCountState>(() => {
    if (cacheReady) {
      return deriveState(getCachedTotalWords(), false);
    }
    return deriveState(0, true);
  });

  // Subscribe to cache updates from loadProjects
  useEffect(() => {
    const unsubscribe = subscribeCacheUpdate(() => {
      setState(deriveState(getCachedTotalWords(), false));
    });

    // Also sync when auth finishes and cache is already ready
    if (!authLoading && getHasLoaded()) {
      const timer = window.setTimeout(() => {
        setState(deriveState(getCachedTotalWords(), false));
      }, 0);
      return () => {
        window.clearTimeout(timer);
        unsubscribe();
      };
    }

    return unsubscribe;
  }, [authLoading]);

  // Refresh function - triggers a re-read from cache
  // The actual data refresh should be done by invalidating + reloading home cache
  const refresh = useCallback(() => {
    if (getHasLoaded()) {
      setState(deriveState(getCachedTotalWords(), false));
    }
  }, []);

  // Words are never capped now — adding words always succeeds.
  const canAddWords = useCallback((_newWordCount: number): {
    canAdd: boolean;
    wouldExceed: boolean;
    excessCount: number;
    availableSlots: number;
  } => {
    void _newWordCount;
    return { canAdd: true, wouldExceed: false, excessCount: 0, availableSlots: Infinity };
  }, []);

  return {
    ...state,
    refresh,
    canAddWords,
  };
}
