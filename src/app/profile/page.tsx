'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProfileView, profileAvatarColor, type ProfileCounts } from '@/components/profile/ProfileView';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { getStats, type CachedStats } from '@/lib/stats-cache';

function formatJoined(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
}

type StatsLoadState = {
  authKey: string;
  stats: CachedStats | null;
};

export default function ProfilePage() {
  const { user, subscription, isPro, wasPro, isAuthenticated, loading: authLoading } = useAuth();
  const { username, accountId } = useProfile();

  const authStatsKey = authLoading ? null : user?.id ?? 'guest';
  const [statsState, setStatsState] = useState<StatsLoadState | null>(null);
  const stats = statsState?.authKey === authStatsKey ? statsState.stats : null;
  const statsLoading = authLoading || (authStatsKey !== null && statsState?.authKey !== authStatsKey);

  const [counts, setCounts] = useState<ProfileCounts | null>(null);

  useEffect(() => {
    if (authLoading || !authStatsKey) return;

    let cancelled = false;
    const subscriptionStatus = subscription?.status ?? 'free';

    getStats(subscriptionStatus, user?.id ?? null, isPro, wasPro)
      .then((freshStats) => {
        if (cancelled) return;
        setStatsState({ authKey: authStatsKey, stats: freshStats });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load stats:', error);
        setStatsState({ authKey: authStatsKey, stats: null });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, authStatsKey, isPro, subscription?.status, user?.id, wasPro]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    Promise.all([
      fetch('/api/follows', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/friends', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ])
      .then(([followsRes, friendsRes]) => {
        if (cancelled) return;
        setCounts({
          following: Array.isArray(followsRes?.following) ? followsRes.following.length : 0,
          followers: Array.isArray(followsRes?.followers) ? followsRes.followers.length : 0,
          friends: Array.isArray(friendsRes?.friends) ? friendsRes.friends.length : 0,
        });
      })
      .catch(() => {
        if (!cancelled) setCounts({ following: 0, followers: 0, friends: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  const name = username?.trim() || (accountId ? `@${accountId}` : 'ゲスト');
  const initial = (username || accountId || user?.email || '?').charAt(0).toUpperCase();
  const color = profileAvatarColor(user?.id ?? accountId ?? 'guest');
  const joined = formatJoined(user?.created_at);

  return (
    <ProfileView
      title="プロフィール"
      backHref="/settings"
      editHref="/settings/account/profile"
      name={name}
      accountId={accountId}
      initial={initial}
      color={color}
      joined={joined}
      planLabel={isPro ? 'PRO PLAN' : 'FREE PLAN'}
      counts={counts}
      countsHref="/friends"
      actions={
        <>
          <Link
            href="/friends"
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-display text-[14px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="group_add" size={18} />
            フレンドを追加
          </Link>
          <Link
            href="/shared"
            aria-label="共有ライブラリ"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="hub" size={20} />
          </Link>
        </>
      }
      stats={stats}
      statsLoading={statsLoading}
    />
  );
}
