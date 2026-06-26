'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { FriendProfile } from '@/lib/friends/types';

export type FollowsTab = 'following' | 'followers';

function displayName(profile: FriendProfile): string {
  return profile.username?.trim() || `@${profile.accountId}`;
}

export function FollowsList({
  title,
  backHref,
  initialTab,
  following,
  followers,
  loading,
}: {
  title: string;
  backHref: string;
  initialTab: FollowsTab;
  following: FriendProfile[];
  followers: FriendProfile[];
  loading: boolean;
}) {
  const [tab, setTab] = useState<FollowsTab>(initialTab);
  const list = tab === 'following' ? following : followers;

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[max(24px,env(safe-area-inset-bottom))] pt-3 font-[var(--font-body)]">
      <div className="mx-auto w-full max-w-xl">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-[18px] pb-1 pt-1">
          <Link
            href={backHref}
            aria-label="戻る"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
          >
            <Icon name="arrow_back" size={22} />
          </Link>
          <div className="min-w-0 flex-1 truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            {title}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-[18px] pt-2">
          <TabButton active={tab === 'following'} onClick={() => setTab('following')} label="フォロー中" count={following.length} />
          <TabButton active={tab === 'followers'} onClick={() => setTab('followers')} label="フォロワー" count={followers.length} />
        </div>

        {/* List */}
        <div className="mt-2 px-[18px]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
              <Icon name="progress_activity" size={20} className="animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="py-16 text-center text-[13px] font-bold text-[var(--color-muted)]">
              {tab === 'following' ? 'まだ誰もフォローしていません' : 'まだフォロワーがいません'}
            </div>
          ) : (
            <div className="flex flex-col">
              {list.map((profile) => (
                <Link
                  key={profile.userId}
                  href={`/profile/${encodeURIComponent(profile.accountId)}`}
                  className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 transition-colors active:bg-[var(--color-surface-secondary)]"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-[var(--solid-ink)] font-display text-[16px] font-extrabold text-white"
                    style={{ backgroundColor: profileAvatarColor(profile.accountId) }}
                  >
                    {(profile.username || profile.accountId || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{displayName(profile)}</div>
                    <div className="truncate font-mono text-[11px] font-bold text-[var(--color-muted)]">@{profile.accountId}</div>
                  </div>
                  <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 font-display text-[13px] font-bold transition-all ${
        active
          ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
      }`}
    >
      {label}
      <span className={`font-mono text-[11px] tabular-nums ${active ? 'text-white' : 'text-[var(--color-muted)]'}`}>{count}</span>
    </button>
  );
}
