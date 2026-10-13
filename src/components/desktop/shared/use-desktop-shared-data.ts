'use client';

// 共有ページ (デスクトップ) のダッシュボード用データ取得フック。
import { useEffect, useRef, useState } from 'react';
import type { PublicStudyGroupSummary, SharedProjectCard } from '@/lib/shared-projects/types';

const FEED_PAGE_SIZE = 12;

// ============ Dashboard data hooks ============

// The desktop view stays mounted (CSS-hidden) on mobile, so dashboard-only
// fetches are gated behind an actual viewport check.
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

export type DiscoverFeedState = {
  projects: SharedProjectCard[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  remove: (projectId: string) => void;
};

type DiscoverFeedResponse = {
  projects?: SharedProjectCard[];
  nextCursor?: string | null;
};

// Newest public wordbooks, paginated — the dashboard's central feed. Fetched
// once per session on the first desktop render of the discover top view.
export function useDiscoverFeed(enabled: boolean): DiscoverFeedState {
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const loading = enabled && !settled;

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    fetch(`/api/shared-projects/discover?category=projects&limit=${FEED_PAGE_SIZE}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as DiscoverFeedResponse | null;
        if (!response.ok || !payload || !Array.isArray(payload.projects)) throw new Error('feed_failed');
        setProjects(payload.projects);
        setNextCursor(payload.nextCursor ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('単語帳を読み込めませんでした。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true);
      });

    return () => controller.abort();
  }, [enabled]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    fetch(`/api/shared-projects/discover?category=projects&limit=${FEED_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as DiscoverFeedResponse | null;
        if (!response.ok || !payload || !Array.isArray(payload.projects)) throw new Error('feed_more_failed');
        setProjects((current) => {
          const known = new Set(current.map((item) => item.project.id));
          return [...current, ...payload.projects!.filter((item) => !known.has(item.project.id))];
        });
        setNextCursor(payload.nextCursor ?? null);
      })
      .catch(() => setError('追加の単語帳を読み込めませんでした。'))
      .finally(() => setLoadingMore(false));
  };

  const remove = (projectId: string) => {
    setProjects((current) => current.filter((item) => item.project.id !== projectId));
  };

  return { projects, nextCursor, loading, loadingMore, error, loadMore, remove };
}

type PublicGroupsResponse = {
  success?: boolean;
  groups?: PublicStudyGroupSummary[];
};

export function usePublicGroupsPreview(enabled: boolean) {
  const [groups, setGroups] = useState<PublicStudyGroupSummary[]>([]);
  const [settled, setSettled] = useState(false);
  const startedRef = useRef(false);
  const loading = enabled && !settled;

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    fetch('/api/shared-projects/groups/public?limit=6', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PublicGroupsResponse | null;
        if (!response.ok || !payload?.success) throw new Error('public_groups_failed');
        setGroups(payload.groups ?? []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('Failed to load public groups preview:', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true);
      });

    return () => controller.abort();
  }, [enabled]);

  return { groups, loading };
}
