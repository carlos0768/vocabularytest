'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { FollowingTodayActivity } from '@/lib/follows/today-activity';

type TodayActivityApiResponse = {
  success?: boolean;
  activity?: FollowingTodayActivity[];
};

/**
 * 今日クイズを解いたフォロー中のユーザー（ホームのカード列用）。
 * 「今日」の中身は刻々と変わるのでキャッシュせず、ホームを開くたびに取り直す。
 * 取得に失敗したら空のまま（カード列を出さないだけ）。
 */
export function useFollowingTodayActivity(): FollowingTodayActivity[] {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [activity, setActivity] = useState<FollowingTodayActivity[]>([]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    let cancelled = false;
    fetch('/api/follows/today', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as TodayActivityApiResponse | null;
        if (!cancelled && response.ok && payload?.success) setActivity(payload.activity ?? []);
      })
      .catch(() => {
        // best-effort
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  return isAuthenticated ? activity : [];
}
