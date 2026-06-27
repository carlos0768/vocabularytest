'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { FollowRelationship } from '@/lib/follows/types';

type FollowApiResponse = {
  success?: boolean;
  error?: string;
  follow?: { id: string; status: 'active' | 'pending' };
};

export function FollowButton({
  accountId,
  initialRelationship,
  initialFollowId,
  onRelationshipChange,
}: {
  accountId: string;
  initialRelationship: FollowRelationship;
  initialFollowId: string | null;
  /** Notified with +1 / -1 when the active-follow state changes, to keep follower counts in sync. */
  onRelationshipChange?: (delta: number) => void;
}) {
  const [relationship, setRelationship] = useState<FollowRelationship>(initialRelationship);
  const [followId, setFollowId] = useState<string | null>(initialFollowId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const isFollowing = relationship === 'following' || relationship === 'mutual';
  const isPending = relationship === 'pending';

  const follow = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const payload = (await response.json().catch(() => null)) as FollowApiResponse | null;
      if (!response.ok || !payload?.success || !payload.follow) {
        throw new Error(payload?.error || 'follow_failed');
      }
      const nextRelationship: FollowRelationship = payload.follow.status === 'active' ? 'following' : 'pending';
      setFollowId(payload.follow.id);
      setRelationship(nextRelationship);
      if (nextRelationship === 'following') onRelationshipChange?.(1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const unfollow = async () => {
    if (!followId) return;
    const wasFollowing = isFollowing;
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/follows', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followId }),
      });
      const payload = (await response.json().catch(() => null)) as FollowApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'unfollow_failed');
      }
      setFollowId(null);
      setRelationship('none');
      if (wasFollowing) onRelationshipChange?.(-1);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const onClick = () => {
    if (loading) return;
    if (isFollowing || isPending) {
      void unfollow();
    } else {
      void follow();
    }
  };

  const label = isFollowing ? 'フォロー中' : isPending ? '申請中' : 'フォロー';
  const icon = loading
    ? 'progress_activity'
    : isFollowing
      ? 'how_to_reg'
      : isPending
        ? 'hourglass_empty'
        : 'person_add';

  // Filled solid-ink style for the primary "follow" CTA; outlined for the
  // already-following / pending states so unfollowing reads as secondary.
  const active = isFollowing || isPending;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] font-display text-[14px] font-bold transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-60 ${
        active
          ? 'bg-white text-[var(--solid-ink)]'
          : 'bg-[var(--solid-ink)] text-white'
      }`}
    >
      <Icon name={icon} size={18} className={loading ? 'animate-spin' : ''} />
      {error ? '再試行' : label}
    </button>
  );
}
