'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import type { FriendProfile } from '@/lib/friends/types';
import { followSuggestionLabel, type FollowSuggestion } from '@/lib/follows/suggestions';
import type { FollowingTodayActivity } from '@/lib/follows/today-activity';

/** × で閉じたおすすめ（端末ごと）。同じ人を何度も出さないためだけのもの。 */
const DISMISSED_STORAGE_KEY = 'merken_follow_suggestion_dismissed';
const DISMISSED_MAX = 200;

function readDismissed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids].slice(-DISMISSED_MAX)));
  } catch {
    // private mode などで保存できなくても閉じる操作自体は効かせる
  }
}

const CARD_CLASS =
  'relative flex w-[83px] shrink-0 snap-start flex-col items-center rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 pb-2.5 pt-2.5';

function displayName(profile: FriendProfile): string {
  return profile.username?.trim() || `@${profile.accountId}`;
}

function Avatar({ profile }: { profile: FriendProfile }) {
  return (
    <ProfileAvatar
      avatarUrl={profile.avatarUrl}
      initial={(profile.username || profile.accountId || '?').charAt(0).toUpperCase()}
      color={profileAvatarColor(profile.accountId)}
      size={48}
      radius={24}
      borderWidth={1.5}
    />
  );
}

/**
 * ホームのマイ単語帳の上に出す、インスタの「おすすめ」風の横スクロールカード列（見出しなし）。
 * 先頭に今日クイズを解いたフォロー中の人（アイコン + 問題数）を並べ、
 * その後ろ（解いた人がいなければ代わり）にフォローのおすすめを並べて横幅を埋める。
 * どちらも無ければ何も描かない。
 */
export function FollowingTodayStrip({
  activity,
  suggestions,
}: {
  activity: FollowingTodayActivity[];
  suggestions: FollowSuggestion[];
}) {
  // 初回描画で localStorage を読む（SSR では window が無いので空集合）。
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    typeof window === 'undefined' ? new Set() : readDismissed(),
  );
  const visibleSuggestions = suggestions.filter((item) => !dismissed.has(item.userId));

  if (activity.length === 0 && visibleSuggestions.length === 0) return null;

  const dismiss = (userId: string) => {
    setDismissed((current) => {
      const next = new Set(current);
      next.add(userId);
      writeDismissed(next);
      return next;
    });
  };

  return (
    <section className="pb-2 pt-2" aria-label="今日クイズを解いたフォロー中の人と、フォローのおすすめ">
      <div className="flex snap-x gap-1.5 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {activity.map((item) => (
          <Link key={item.userId} href={`/profile/${encodeURIComponent(item.profile.accountId)}`} className={CARD_CLASS}>
            <Avatar profile={item.profile} />
            <div className="mt-1.5 w-full truncate text-center font-display text-[11px] font-extrabold text-[var(--solid-ink)]">
              {displayName(item.profile)}
            </div>
            <div className="mt-1 flex items-baseline gap-0.5 text-[var(--color-accent)]">
              <span className="font-display text-[14px] font-extrabold leading-none tabular-nums">
                {item.answerCount.toLocaleString()}
              </span>
              <span className="text-[9px] font-bold">問</span>
            </div>
          </Link>
        ))}
        {visibleSuggestions.map((item) => (
          <SuggestionCard key={item.userId} suggestion={item} onDismiss={() => dismiss(item.userId)} />
        ))}
      </div>
    </section>
  );
}

type FollowState = 'idle' | 'loading' | 'following' | 'pending' | 'error';

function SuggestionCard({ suggestion, onDismiss }: { suggestion: FollowSuggestion; onDismiss: () => void }) {
  const [state, setState] = useState<FollowState>('idle');
  const profileHref = `/profile/${encodeURIComponent(suggestion.profile.accountId)}`;

  const follow = async () => {
    setState('loading');
    try {
      const response = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: suggestion.profile.accountId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; follow?: { status: 'active' | 'pending' } }
        | null;
      if (!response.ok || !payload?.success || !payload.follow) throw new Error('follow_failed');
      setState(payload.follow.status === 'active' ? 'following' : 'pending');
    } catch {
      setState('error');
    }
  };

  const done = state === 'following' || state === 'pending';
  const buttonLabel =
    state === 'following' ? 'フォロー中'
      : state === 'pending' ? 'リクエスト済'
        : state === 'error' ? '再試行'
          : 'フォロー';

  return (
    <div className={CARD_CLASS}>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={`${displayName(suggestion.profile)}さんをおすすめから外す`}
        className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-muted)]"
      >
        <Icon name="close" size={12} />
      </button>
      <Link href={profileHref} className="flex w-full flex-col items-center">
        <Avatar profile={suggestion.profile} />
        <div className="mt-1.5 w-full truncate text-center font-display text-[11px] font-extrabold text-[var(--solid-ink)]">
          {displayName(suggestion.profile)}
        </div>
        <div className="mt-0.5 w-full truncate text-center text-[9px] font-bold text-[var(--color-muted)]">
          {followSuggestionLabel(suggestion)}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => void follow()}
        disabled={state === 'loading' || done}
        className={`mt-1.5 w-full rounded-[7px] py-1 text-[10px] font-extrabold transition-opacity disabled:opacity-80 ${
          done
            ? 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--solid-ink)]'
            : 'bg-[var(--color-accent)] text-white'
        }`}
      >
        {state === 'loading' ? '…' : buttonLabel}
      </button>
    </div>
  );
}
