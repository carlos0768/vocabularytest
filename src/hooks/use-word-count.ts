'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getRepository } from '@/lib/db';
import { getGuestUserId, FREE_WORD_LIMIT } from '@/lib/utils';
import { useAuth } from './use-auth';
import type { SubscriptionStatus } from '@/types';

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

// Hook for tracking word count and limit status
export function useWordCount() {
  const { isPro, user, subscription, loading: authLoading } = useAuth();
  const [state, setState] = useState<WordCountState>({
    count: 0,
    limit: FREE_WORD_LIMIT,
    remaining: FREE_WORD_LIMIT,
    percentage: 0,
    isNearLimit: false,
    isAlmostFull: false,
    isAtLimit: false,
    loading: true,
  });

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  const loadWordCount = useCallback(async () => {
    if (authLoading) return;

    try {
      setState(prev => ({ ...prev, loading: true }));

      // Get all projects for the user
      const userId = isPro && user ? user.id : getGuestUserId();
      const projects = await repository.getProjects(userId);

      // Count all words across all projects
      let totalWords = 0;
      for (const project of projects) {
        const words = await repository.getWords(project.id);
        totalWords += words.length;
      }

      // For Pro users, no limit
      const limit = isPro ? Infinity : FREE_WORD_LIMIT;
      const remaining = isPro ? Infinity : Math.max(0, FREE_WORD_LIMIT - totalWords);
      const percentage = isPro ? 0 : Math.min(100, Math.round((totalWords / FREE_WORD_LIMIT) * 100));

      setState({
        count: totalWords,
        limit,
        remaining: isPro ? Infinity : remaining,
        percentage,
        isNearLimit: !isPro && percentage >= 80,
        isAlmostFull: !isPro && percentage >= 95,
        isAtLimit: !isPro && totalWords >= FREE_WORD_LIMIT,
        loading: false,
      });
    } catch (error) {
      console.error('Failed to load word count:', error);
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [authLoading, isPro, user, repository]);

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

  useEffect(() => {
    loadWordCount();
  }, [loadWordCount]);

  return {
    ...state,
    refresh: loadWordCount,
    canAddWords,
  };
}
