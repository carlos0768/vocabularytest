'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { ProfileView, profileAvatarColor, type ProfileCounts } from '@/components/profile/ProfileView';
import { useAuth } from '@/hooks/use-auth';
import type { CachedStats } from '@/lib/stats-cache';
import type { FriendProfile } from '@/lib/friends/types';

function formatJoined(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
}

type UserProfileResponse = {
  success?: boolean;
  isSelf?: boolean;
  profile?: FriendProfile;
  joinedAt?: string | null;
  counts?: ProfileCounts;
  stats?: CachedStats | null;
  error?: string;
};

export default function FriendProfilePage() {
  const params = useParams<{ accountId: string }>();
  const accountId = decodeURIComponent(String(params?.accountId ?? '')).replace(/^@/, '');
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [error, setError] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !accountId) return;

    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(accountId)}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((payload: UserProfileResponse | null) => {
        if (cancelled) return;
        if (!payload?.success || !payload.profile) {
          setError(true);
          setData(null);
        } else {
          setData(payload);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, authLoading, isAuthenticated]);

  const showLoading = authLoading || (isAuthenticated && !!accountId && !fetched);
  const showNotFound = (!authLoading && (!isAuthenticated || !accountId)) || error || (fetched && !data?.profile);

  if (showLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] text-[var(--color-muted)]">
        <Icon name="progress_activity" size={24} className="animate-spin" />
        <span className="ml-2 text-sm font-bold">読み込み中...</span>
      </div>
    );
  }

  if (showNotFound || !data?.profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-background)] px-6 text-center">
        <Icon name="person_off" size={32} className="text-[var(--color-muted)]" />
        <div className="font-display text-lg font-bold text-[var(--solid-ink)]">ユーザーが見つかりません</div>
        <a
          href="/friends"
          className="inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-3 font-display text-sm font-bold text-white"
        >
          フィードに戻る
        </a>
      </div>
    );
  }

  const profile = data.profile;
  const name = profile.username?.trim() || `@${profile.accountId}`;
  const initial = (profile.username || profile.accountId || '?').charAt(0).toUpperCase();
  const color = profileAvatarColor(profile.accountId);
  const joined = formatJoined(data.joinedAt ?? null);

  return (
    <ProfileView
      title="プロフィール"
      backHref="/friends"
      name={name}
      accountId={profile.accountId}
      initial={initial}
      color={color}
      joined={joined}
      planLabel={null}
      counts={data.counts ?? null}
      followingHref={`/profile/${encodeURIComponent(profile.accountId)}/follows?tab=following`}
      followersHref={`/profile/${encodeURIComponent(profile.accountId)}/follows?tab=followers`}
      friendsHref={`/profile/${encodeURIComponent(profile.accountId)}/follows?tab=following`}
      stats={data.stats ?? null}
      statsLoading={false}
    />
  );
}
