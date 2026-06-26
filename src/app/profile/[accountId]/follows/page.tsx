'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { FollowsList, type FollowsTab } from '@/components/profile/FollowsList';
import { useAuth } from '@/hooks/use-auth';
import type { FriendProfile } from '@/lib/friends/types';

type UserFollowsResponse = {
  success?: boolean;
  profile?: FriendProfile;
  following?: FriendProfile[];
  followers?: FriendProfile[];
};

function FriendFollowsInner() {
  const params = useParams<{ accountId: string }>();
  const accountId = decodeURIComponent(String(params?.accountId ?? '')).replace(/^@/, '');
  const searchParams = useSearchParams();
  const initialTab: FollowsTab = searchParams.get('tab') === 'followers' ? 'followers' : 'following';
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [data, setData] = useState<UserFollowsResponse | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !accountId) return;

    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(accountId)}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((payload: UserFollowsResponse | null) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, authLoading, isAuthenticated]);

  const name = data?.profile?.username?.trim() || (accountId ? `@${accountId}` : 'フォロー');

  return (
    <FollowsList
      title={name}
      backHref={`/profile/${encodeURIComponent(accountId)}`}
      initialTab={initialTab}
      following={data?.following ?? []}
      followers={data?.followers ?? []}
      loading={authLoading || (isAuthenticated && !fetched)}
    />
  );
}

export default function FriendFollowsPage() {
  return (
    <Suspense fallback={null}>
      <FriendFollowsInner />
    </Suspense>
  );
}
