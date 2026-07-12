'use client';

/**
 * 参加中のグループ一覧を取得する共有フック。
 * ホーム（参加中のグループ表示）と /shared（デスクトップの検索フィルタ）の
 * 両方から使われるため、モジュールレベルのキャッシュで二重フェッチを防ぐ。
 * グループの参加/退会後は refreshMyGroups() で無効化する。
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { StudyGroupSummary } from '@/lib/shared-projects/types';

type MyGroupsApiResponse = {
  success?: boolean;
  groups?: StudyGroupSummary[];
  error?: string;
};

let cachedGroups: StudyGroupSummary[] | null = null;
let inflight: Promise<StudyGroupSummary[]> | null = null;
const listeners = new Set<(groups: StudyGroupSummary[]) => void>();

function notify(groups: StudyGroupSummary[]) {
  cachedGroups = groups;
  listeners.forEach((listener) => listener(groups));
}

async function fetchMyGroups(): Promise<StudyGroupSummary[]> {
  const response = await fetch('/api/shared-projects/groups', { cache: 'no-store' });
  const payload = await response.json().catch(() => null) as MyGroupsApiResponse | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'my_groups_failed');
  }
  return payload.groups ?? [];
}

function loadMyGroups(force = false): Promise<StudyGroupSummary[]> {
  if (!force && cachedGroups !== null) return Promise.resolve(cachedGroups);
  if (!inflight) {
    inflight = fetchMyGroups()
      .then((groups) => {
        notify(groups);
        return groups;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 参加/退会後に呼ぶとキャッシュを破棄して再取得する。 */
export function refreshMyGroups(): void {
  cachedGroups = null;
  void loadMyGroups(true).catch((error) => {
    console.warn('Failed to refresh joined groups:', error);
  });
}

export function useMyGroups(): { groups: StudyGroupSummary[]; loading: boolean } {
  const { isAuthenticated, loading: authLoading } = useAuth();
  // null = 未取得。表示値は認証状態から導出する（effect内の同期setStateを避ける）。
  const [fetched, setFetched] = useState<StudyGroupSummary[] | null>(cachedGroups);

  useEffect(() => {
    const listener = (next: StudyGroupSummary[]) => setFetched(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    loadMyGroups()
      .then((next) => {
        if (!cancelled) setFetched(next);
      })
      .catch((error) => {
        console.warn('Failed to load joined groups:', error);
        if (!cancelled) setFetched((current) => current ?? []);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  const groups = !authLoading && isAuthenticated && fetched ? fetched : [];
  const loading = authLoading || (isAuthenticated && fetched === null);
  return { groups, loading };
}
