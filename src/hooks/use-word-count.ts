'use client';

import { useState, useEffect, useCallback } from 'react';
import { FREE_WORD_LIMIT } from '@/lib/utils';
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

function deriveState(totalWords: number, isPro: boolean, isLoading: boolean): WordCountState {
  const limit = isPro ? Infinity : FREE_WORD_LIMIT;
  const remaining = isPro ? Infinity : Math.max(0, FREE_WORD_LIMIT - totalWords);
  const percentage = isPro ? 0 : Math.min(100, Math.round((totalWords / FREE_WORD_LIMIT) * 100));

  return {
    count: totalWords,
    limit,
    remaining,
    percentage,
    isNearLimit: !isPro && percentage >= 80,
    isAlmostFull: !isPro && percentage >= 95,
    isAtLimit: !isPro && totalWords >= FREE_WORD_LIMIT,
    loading: isLoading,
  };
}

// Hook for tracking word count and limit status
// Strategy 1: Reads from home-cache instead of making independent DB queries
export function useWordCount() {
  const { isPro, loading: authLoading } = useAuth();
  const cacheReady = getHasLoaded();

  const [state, setState] = useState<WordCountState>(() => {
    if (cacheReady) {
      return deriveState(getCachedTotalWords(), isPro, false);
    }
    return deriveState(0, false, true);
  });

  // Subscribe to cache updates from loadProjects
  useEffect(() => {
    const unsubscribe = subscribeCacheUpdate(() => {
      setState(deriveState(getCachedTotalWords(), isPro, false));
    });

    // Also sync when auth finishes and cache is already ready
    if (!authLoading && getHasLoaded()) {
      setState(deriveState(getCachedTotalWords(), isPro, false));
    }

    return unsubscribe;
  }, [isPro, authLoading]);

  // Refresh function - triggers a re-read from cache
  // The actual data refresh should be done by invalidating + reloading home cache
  const refresh = useCallback(() => {
    if (getHasLoaded()) {
      setState(deriveState(getCachedTotalWords(), isPro, false));
    }
  }, [isPro]);

  // Check if adding new words would exceed limit
  const canAddWords = useCallback((newWordCount: number): {
    canAdd: boolean;
    wouldExceed: boolean;
    excessCount: number;
    availableSlots: number;
  } => {
    if (isPro) {
      return { canAdd: true, wouldExceed: false, excessCount: 0, availableSlots: Infinity };
    }

    const availableSlots = Math.max(0, FREE_WORD_LIMIT - state.count);
    const wouldExceed = state.count + newWordCount > FREE_WORD_LIMIT;
    const excessCount = Math.max(0, (state.count + newWordCount) - FREE_WORD_LIMIT);

    return {
      canAdd: !state.isAtLimit,
      wouldExceed,
      excessCount,
      availableSlots,
    };
  }, [isPro, state.count, state.isAtLimit]);

  return {
    ...state,
    refresh,
    canAddWords,
  };
}
