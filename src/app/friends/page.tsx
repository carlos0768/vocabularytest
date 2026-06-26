'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import type {
  FriendProfile,
  FriendshipSummary,
  FriendsHomePayload,
  FriendTimelineSession,
} from '@/lib/friends/types';

type FriendsApiResponse = Partial<FriendsHomePayload> & {
  success?: boolean;
  error?: string;
};

type TimelineApiResponse = {
  success?: boolean;
  sessions?: FriendTimelineSession[];
  error?: string;
};

type MutationResponse = {
  success?: boolean;
  error?: string;
};

const EMPTY_FRIENDS: FriendsHomePayload = {
  profile: { userId: '', username: null, accountId: '' },
  friends: [],
  incoming: [],
  outgoing: [],
};

// Site-wide avatar/thumbnail palette (matches home, collections, shared).
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function avatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  }
  return THUMBS[Math.abs(hash) % THUMBS.length];
}

function displayName(profile: FriendProfile): string {
  return profile.username?.trim() || `@${profile.accountId}`;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function FriendsPage() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [home, setHome] = useState<FriendsHomePayload>(EMPTY_FRIENDS);
  const [sessions, setSessions] = useState<FriendTimelineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const hasRequests = home.incoming.length > 0 || home.outgoing.length > 0;

  const loadFriends = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/friends', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as FriendsApiResponse | null;
      if (!response.ok || !payload?.success || !payload.profile) {
        throw new Error(payload?.error || 'friends_fetch_failed');
      }
      setHome({
        profile: payload.profile,
        friends: payload.friends ?? [],
        incoming: payload.incoming ?? [],
        outgoing: payload.outgoing ?? [],
      });
    } catch (loadError) {
      console.warn('Failed to load friends:', loadError);
      setError('フレンド情報を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadTimeline = useCallback(async () => {
    if (!isAuthenticated) return;
    setTimelineLoading(true);
    try {
      const response = await fetch('/api/follows/timeline?limit=40', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as TimelineApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'timeline_fetch_failed');
      }
      setSessions(payload.sessions ?? []);
    } catch (loadError) {
      console.warn('Failed to load timeline:', loadError);
    } finally {
      setTimelineLoading(false);
    }
  }, [isAuthenticated]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadFriends(), loadTimeline()]);
  }, [loadFriends, loadTimeline]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      setTimelineLoading(false);
      return;
    }
    void refreshAll();
  }, [authLoading, isAuthenticated, refreshAll]);

  const mutate = useCallback(async (
    key: string,
    request: () => Promise<Response>,
  ) => {
    if (actionLoading) return;
    setActionLoading(key);
    setError(null);
    try {
      const response = await request();
      const payload = await response.json().catch(() => null) as MutationResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'friend_mutation_failed');
      }
      await refreshAll();
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : '操作に失敗しました。';
      setError(message);
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, refreshAll]);

  const respondRequest = (friendshipId: string, action: 'accept' | 'decline') => mutate(`${action}:${friendshipId}`, () => fetch('/api/friends/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendshipId, action }),
  }));

  const removeFriend = (friendshipId: string) => mutate(`delete:${friendshipId}`, () => fetch(`/api/friends/${encodeURIComponent(friendshipId)}`, {
    method: 'DELETE',
  }));

  const renderContent = () => {
    if (authLoading || loading) {
      return (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
          <Icon name="progress_activity" className="animate-spin" />
          <span className="ml-2 text-sm font-bold">読み込み中...</span>
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div className="flex items-center justify-center px-[18px] py-20">
          <SolidPanel className="!rounded-[14px]" faceClassName="!p-5 text-center">
            <Icon name="lock" size={28} className="mx-auto text-[var(--color-muted)]" />
            <div className="mt-3 font-display text-lg font-bold text-[var(--solid-ink)]">ログインが必要です</div>
            <Link href="/login" className="mt-4 inline-flex rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-3 font-display text-sm font-bold text-white">
              ログイン
            </Link>
          </SolidPanel>
        </div>
      );
    }

    return (
      <>
        {error && (
          <div className="mx-[18px] mb-3 flex items-center justify-between rounded-[12px] border border-[var(--color-error)] bg-[var(--color-error-light)] px-4 py-3 text-[13px] font-bold text-[var(--color-error)]">
            <span>{error}</span>
            <button type="button" onClick={() => void refreshAll()} className="ml-3 underline">再試行</button>
          </div>
        )}

        {hasRequests && (
          <div className="mb-2 px-[18px]">
            <RequestsSection
              incoming={home.incoming}
              outgoing={home.outgoing}
              actionLoading={actionLoading}
              onRespondRequest={respondRequest}
              onRemoveFriend={removeFriend}
            />
          </div>
        )}

        {sessions.map((session) => (
          <TimelineItem key={session.id} session={session} />
        ))}

        {timelineLoading && (
          <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
            <Icon name="progress_activity" className="animate-spin" size={20} />
          </div>
        )}

        {!timelineLoading && sessions.length === 0 && (
          <div className="px-[18px] py-16 text-center text-[13px] font-bold text-[var(--color-muted)]">
            まだ学習セッションがありません。クイズを始めると、ここにフィードが表示されます。
          </div>
        )}

        {home.friends.length > 0 && (
          <div className="mx-[18px] mt-6 border-t border-[var(--color-border)] pt-5 pb-4">
            <FriendsSection
              friends={home.friends}
              actionLoading={actionLoading}
              onRemoveFriend={removeFriend}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <DesktopTopbar title="フィード" crumb="学習タイムライン">
          <DesktopButton href="/shared" icon="hub" variant="ghost">共有ライブラリ</DesktopButton>
        </DesktopTopbar>
        <div className="ds-scroll">
          {renderContent()}
        </div>
      </div>

      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
        <div className="px-[18px] pb-2 pt-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
            FEED
          </div>
          <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] text-[var(--solid-ink)]">
            フィード
          </div>
        </div>
        {renderContent()}
      </div>
    </>
  );
}

function RequestsSection({
  incoming,
  outgoing,
  actionLoading,
  onRespondRequest,
  onRemoveFriend,
}: {
  incoming: FriendshipSummary[];
  outgoing: FriendshipSummary[];
  actionLoading: string | null;
  onRespondRequest: (friendshipId: string, action: 'accept' | 'decline') => void;
  onRemoveFriend: (friendshipId: string) => void;
}) {
  return (
    <SolidPanel className="!rounded-[14px]" faceClassName="!p-3">
      <SectionTitle icon="mark_email_unread" label="申請" count={incoming.length + outgoing.length} />
      <div className="mt-2 flex flex-col gap-1.5">
        {incoming.map((item) => (
          <FriendRow key={item.id} friendship={item}>
            <button
              type="button"
              onClick={() => onRespondRequest(item.id, 'accept')}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] text-white disabled:opacity-50"
              aria-label="承認"
            >
              <Icon name={actionLoading === `accept:${item.id}` ? 'progress_activity' : 'check'} className={actionLoading === `accept:${item.id}` ? 'animate-spin' : ''} size={14} />
            </button>
            <button
              type="button"
              onClick={() => onRespondRequest(item.id, 'decline')}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="拒否"
            >
              <Icon name="close" size={14} />
            </button>
          </FriendRow>
        ))}
        {outgoing.map((item) => (
          <FriendRow key={item.id} friendship={item}>
            <StatusChip label="申請中" />
            <button
              type="button"
              onClick={() => onRemoveFriend(item.id)}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="申請を取り消す"
            >
              <Icon name="close" size={14} />
            </button>
          </FriendRow>
        ))}
      </div>
    </SolidPanel>
  );
}

function FriendsSection({
  friends,
  actionLoading,
  onRemoveFriend,
}: {
  friends: FriendshipSummary[];
  actionLoading: string | null;
  onRemoveFriend: (friendshipId: string) => void;
}) {
  return (
    <>
      <SectionTitle icon="groups" label="フレンド" count={friends.length} />
      <div className="mt-2 flex flex-col gap-1.5">
        {friends.map((friend) => (
          <FriendRow key={friend.id} friendship={friend}>
            <button
              type="button"
              onClick={() => onRemoveFriend(friend.id)}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="フレンド解除"
            >
              <Icon name={actionLoading === `delete:${friend.id}` ? 'progress_activity' : 'person_remove'} className={actionLoading === `delete:${friend.id}` ? 'animate-spin' : ''} size={14} />
            </button>
          </FriendRow>
        ))}
      </div>
    </>
  );
}

function TimelineItem({ session }: { session: FriendTimelineSession }) {
  const profileHref = `/profile/${encodeURIComponent(session.profile.accountId)}`;
  return (
    <article className="border-b border-[var(--color-border)]">
      <div className="flex items-start gap-3.5 px-[18px] py-4">
        <Link href={profileHref} aria-label={`${displayName(session.profile)}のプロフィール`} className="shrink-0">
          <Avatar profile={session.profile} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-[var(--solid-ink)]">
            <Link href={profileHref} className="font-display font-extrabold hover:underline">
              {displayName(session.profile)}
            </Link>
            さんが{session.answerCount}問クイズを解きました！
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-bold text-[var(--color-muted)]">
            <span className="font-mono text-[11px]">@{session.profile.accountId}</span>
            <span className="text-[var(--color-border)]">·</span>
            <span>{formatSessionTime(session.startedAt)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function FriendRow({
  friendship,
  children,
}: {
  friendship: FriendshipSummary;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-2.5 py-2">
      <Avatar profile={friendship.profile} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-extrabold text-[var(--solid-ink)]">{displayName(friendship.profile)}</div>
        <div className="truncate font-mono text-[10px] font-bold text-[var(--color-muted)]">@{friendship.profile.accountId}</div>
      </div>
      {children}
    </div>
  );
}

function Avatar({
  profile,
  size = 'md',
}: {
  profile: Pick<FriendProfile, 'username' | 'accountId'>;
  size?: 'sm' | 'md';
}) {
  const label = (profile.username || profile.accountId || '?').charAt(0).toUpperCase();
  const color = avatarColor(profile.accountId);
  const dimension = size === 'sm' ? 'h-9 w-9 rounded-[9px] text-[14px]' : 'h-11 w-11 rounded-[11px] text-[16px]';
  return (
    <div
      className={`flex shrink-0 items-center justify-center border-2 border-[var(--solid-ink)] font-display font-extrabold text-white ${dimension}`}
      style={{ backgroundColor: color }}
    >
      {label}
    </div>
  );
}

function SectionTitle({
  icon,
  label,
  count,
}: {
  icon: string;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={16} className="text-[var(--color-accent)]" />
      <span className="font-display text-[13px] font-extrabold text-[var(--solid-ink)]">{label}</span>
      {typeof count === 'number' && (
        <span className="rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{count}</span>
      )}
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-7 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 text-[10px] font-bold text-[var(--color-muted)]">
      {label}
    </span>
  );
}

