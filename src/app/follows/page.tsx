'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FollowsList, type FollowsTab } from '@/components/profile/FollowsList';
import { useAuth } from '@/hooks/use-auth';
import type { FriendProfile } from '@/lib/friends/types';

type FollowSummaryLike = { profile?: FriendProfile };
type FollowsApiResponse = {
  following?: FollowSummaryLike[];
  followers?: FollowSummaryLike[];
};

function FollowsPageInner() {
  const searchParams = useSearchParams();
  const initialTab: FollowsTab = searchParams.get('tab') === 'followers' ? 'followers' : 'following';
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [following, setFollowing] = useState<FriendProfile[]>([]);
  const [followers, setFollowers] = useState<FriendProfile[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    fetch('/api/follows', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((payload: FollowsApiResponse | null) => {
        if (cancelled) return;
        const toProfiles = (arr: FollowSummaryLike[] | undefined) =>
          (arr ?? []).map((item) => item.profile).filter((p): p is FriendProfile => Boolean(p));
        setFollowing(toProfiles(payload?.following));
        setFollowers(toProfiles(payload?.followers));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  return (
    <FollowsList
      title="フォロー"
      backHref="/profile"
      initialTab={initialTab}
      following={following}
      followers={followers}
      loading={authLoading || (isAuthenticated && !fetched)}
    />
  );
}

export default function FollowsPage() {
  return (
    <Suspense fallback={null}>
      <FollowsPageInner />
    </Suspense>
  );
}
