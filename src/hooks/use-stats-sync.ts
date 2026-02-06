'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { registerStatsSyncCallback } from '@/lib/utils';
import type { WrongAnswer } from '@/lib/utils';
import {
  syncDailyStats,
  syncStreak,
  syncWrongAnswer,
  syncRemoveWrongAnswer,
  syncClearAllWrongAnswers,
  pullStatsFromRemote,
  pushLocalStatsToRemote,
} from '@/lib/stats-sync';

const STATS_SYNC_INIT_KEY = 'merken_stats_sync_initialized';

export function useStatsSync() {
  const { user, isPro } = useAuth();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!user || !isPro) {
      // Unregister callback when not Pro
      registerStatsSyncCallback(null);
      hasInitializedRef.current = false;
      return;
    }

    const userId = user.id;

    // Register sync callback for all stat mutations
    registerStatsSyncCallback((event, payload) => {
      switch (event) {
        case 'daily_stats':
          syncDailyStats(
            userId,
            payload.date as string,
            payload.quizCount as number,
            payload.correctCount as number,
            payload.masteredCount as number,
          );
          break;
        case 'streak':
          syncStreak(
            userId,
            payload.streakCount as number,
            payload.lastActivityDate as string,
          );
          break;
        case 'wrong_answer':
          syncWrongAnswer(userId, payload.wrongAnswer as WrongAnswer);
          break;
        case 'remove_wrong_answer':
          syncRemoveWrongAnswer(userId, payload.wordId as string);
          break;
        case 'clear_wrong_answers':
          syncClearAllWrongAnswers(userId);
          break;
      }
    });

    // On first mount as Pro, push local data and pull remote data
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;

      // Check if this is the first time syncing (initial Pro migration)
      const syncKey = `${STATS_SYNC_INIT_KEY}_${userId}`;
      const hasBeenInitialized = localStorage.getItem(syncKey);

      if (!hasBeenInitialized) {
        // First time: push local → remote, then pull remote → local
        pushLocalStatsToRemote(userId).then(() => {
          localStorage.setItem(syncKey, new Date().toISOString());
          return pullStatsFromRemote(userId);
        }).catch((e) => {
          console.error('[useStatsSync] Initial sync failed:', e);
        });
      } else {
        // Subsequent: just pull remote → local
        pullStatsFromRemote(userId).catch((e) => {
          console.error('[useStatsSync] Pull failed:', e);
        });
      }
    }

    return () => {
      registerStatsSyncCallback(null);
    };
  }, [user, isPro]);
}
