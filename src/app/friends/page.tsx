'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DesktopFeed } from '@/components/desktop/DesktopFeed';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import {
  avatarColor,
  displayName,
  formatSessionTime,
  type FeedEntry,
} from '@/lib/friends/feed-display';
import type {
  FriendProfile,
  FriendshipSummary,
  FriendsHomePayload,
  FriendTimelineSession,
} from '@/lib/friends/types';
import type { StudyGroupFeedEvent } from '@/lib/shared-projects/types';

type FriendsApiResponse = Partial<FriendsHomePayload> & {
  success?: boolean;
  error?: string;
};

type TimelineApiResponse = {
  success?: boolean;
  sessions?: FriendTimelineSession[];
  groupEvents?: StudyGroupFeedEvent[];
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

export default function FriendsPage() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [home, setHome] = useState<FriendsHomePayload>(EMPTY_FRIENDS);
  const [sessions, setSessions] = useState<FriendTimelineSession[]>([]);
  const [groupEvents, setGroupEvents] = useState<StudyGroupFeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<FriendTimelineSession | null>(null);

  const hasRequests = home.incoming.length > 0 || home.outgoing.length > 0;

  const feedEntries = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [
      ...sessions.map((session) => ({ kind: 'quiz' as const, sortAt: session.lastAnsweredAt, session })),
      ...groupEvents.map((event) => ({ kind: 'group_event' as const, sortAt: event.createdAt, event })),
    ];
    return entries.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());
  }, [sessions, groupEvents]);

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
      setGroupEvents(payload.groupEvents ?? []);
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

  const renderFeedEntries = () => (
    <>
      {feedEntries.length > 0 && (
        <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {feedEntries.map((entry) => (
            entry.kind === 'quiz'
              ? (
                <TimelineItem
                  key={`quiz-${entry.session.id}`}
                  session={entry.session}
                  onOpen={() => setActiveSession(entry.session)}
                />
              )
              : <GroupEventItem key={`group-${entry.event.id}`} event={entry.event} />
          ))}
        </div>
      )}

      {timelineLoading && (
        <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
          <Icon name="progress_activity" className="animate-spin" size={20} />
        </div>
      )}

      {!timelineLoading && feedEntries.length === 0 && (
        <div className="px-[18px] py-16 text-center text-[13px] font-bold text-[var(--color-muted)]">
          まだ学習セッションがありません。クイズを始めると、ここにフィードが表示されます。
        </div>
      )}
    </>
  );

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

        {renderFeedEntries()}
      </>
    );
  };

  return (
    <>
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <DesktopFeed
          loading={authLoading || loading}
          timelineLoading={timelineLoading}
          isAuthenticated={isAuthenticated}
          error={error}
          entries={feedEntries}
          home={home}
          actionLoading={actionLoading}
          activeSession={activeSession}
          onOpenSession={setActiveSession}
          onCloseSession={() => setActiveSession(null)}
          onRespondRequest={respondRequest}
          onRemoveFriend={removeFriend}
          onRefresh={() => void refreshAll()}
        />
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

      {activeSession && (
        <SessionDetailModal session={activeSession} onClose={() => setActiveSession(null)} />
      )}
    </>
  );
}

function RequestRows({
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
    <>
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
        <RequestRows
          incoming={incoming}
          outgoing={outgoing}
          actionLoading={actionLoading}
          onRespondRequest={onRespondRequest}
          onRemoveFriend={onRemoveFriend}
        />
      </div>
    </SolidPanel>
  );
}

function TimelineItem({
  session,
  onOpen,
}: {
  session: FriendTimelineSession;
  onOpen: () => void;
}) {
  const profileHref = `/profile/${encodeURIComponent(session.profile.accountId)}`;
  return (
    <article className="transition-colors hover:bg-[var(--color-surface-secondary)]">
      {/* 行全体をタップで学習内容モーダルを開く（下方向への展開はしない） */}
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label="学習内容を見る"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
        className="flex cursor-pointer items-start gap-3.5 px-[18px] py-4"
      >
        <Link
          href={profileHref}
          aria-label={`${displayName(session.profile)}のプロフィール`}
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
        >
          <Avatar profile={session.profile} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-[var(--solid-ink)]">
            <Link
              href={profileHref}
              className="font-display font-extrabold hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {displayName(session.profile)}
            </Link>
            さんが{session.answerCount}問クイズを解きました！
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-bold text-[var(--color-muted)]">
            <span className="font-mono text-[11px]">@{session.profile.accountId}</span>
            <span className="text-[var(--color-border)]">·</span>
            <span>{formatSessionTime(session.lastAnsweredAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <MetricChip icon="quiz" value={session.answerCount} unit="問" variant="quiz" />
            <MetricChip icon="check_circle" value={session.masteredCount} unit="語 習得" variant="mastered" />
          </div>
        </div>
        <Icon name="chevron_right" size={20} className="mt-1 shrink-0 text-[var(--color-muted)]" />
      </div>
    </article>
  );
}

/** 学習内容の詳細（モバイル）。単語詳細と同じく画面中央に浮き上がるモーダルで表示する。 */
function SessionDetailModal({
  session,
  onClose,
}: {
  session: FriendTimelineSession;
  onClose: () => void;
}) {
  const profileHref = `/profile/${encodeURIComponent(session.profile.accountId)}`;
  return (
    <div className="fixed inset-0 z-[80] lg:hidden" style={{ fontFamily: 'var(--font-body)' }}>
      <div
        className="animate-fade-in absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center px-4 py-10" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="学習の詳細"
          className="animate-fade-in-up w-full overflow-y-auto overscroll-contain"
          onClick={(event) => event.stopPropagation()}
          style={{
            maxWidth: 480,
            maxHeight: '80dvh',
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderRadius: 20,
          }}
        >
          <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-[var(--color-border)] bg-[#faf7f1] px-5 py-3.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              学習の詳細
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--color-border)] bg-white text-[var(--color-muted)]"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-start gap-3.5">
              <Link
                href={profileHref}
                aria-label={`${displayName(session.profile)}のプロフィール`}
                className="shrink-0"
              >
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
                  <span>{formatSessionTime(session.lastAnsweredAt)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <MetricChip icon="quiz" value={session.answerCount} unit="問" variant="quiz" />
                  <MetricChip icon="check_circle" value={session.masteredCount} unit="語 習得" variant="mastered" />
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                <Icon name="school" size={13} />
                習得した単語
              </div>
              {session.words.length > 0 ? (
                <div className="mt-2.5 flex flex-col gap-2">
                  {session.words.map((word) => (
                    <div key={word.id} className="rounded-[12px] border border-[#bbf7d0] bg-[var(--color-accent-subtle)] px-4 py-3">
                      <div className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{word.english}</div>
                      <div className="mt-0.5 text-[13px] font-bold text-[var(--color-muted)]">{word.japanese}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-[13px] font-bold text-[var(--color-muted)]">
                  習得済みに変わった単語はありません
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupEventItem({ event }: { event: StudyGroupFeedEvent }) {
  return (
    <article>
      <Link href={`/groups/${event.groupId}`} className="flex items-start gap-3.5 px-[18px] py-4 transition-colors active:bg-[var(--color-surface-secondary)]">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-[var(--solid-ink)] text-white"
          style={{ backgroundColor: avatarColor(event.groupId) }}
        >
          <Icon name="library_add" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-[var(--solid-ink)]">
            <span className="font-display font-extrabold">{event.groupName}</span>
            に「{event.projectTitle}」が追加されました！
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-bold text-[var(--color-muted)]">
            {event.actorName && <span>{event.actorName}</span>}
            {event.actorName && <span className="text-[var(--color-border)]">·</span>}
            <span>{formatSessionTime(event.createdAt)}</span>
          </div>
        </div>
        <Icon name="chevron_right" size={20} className="mt-1 shrink-0 text-[var(--color-muted)]" />
      </Link>
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

/** 解いた数・習得数のチップ。ソリッドスタイル（インク/アクセントの1.5px枠 + 角丸7px）で統一する。 */
function MetricChip({
  icon,
  value,
  unit,
  variant,
}: {
  icon: string;
  value: number;
  unit: string;
  variant: 'quiz' | 'mastered';
}) {
  const styles = {
    quiz: 'border-[var(--color-accent-ink)] bg-[var(--color-accent-light)] text-[var(--color-accent-ink)]',
    mastered: 'border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-[7px] border-[1.5px] px-2 py-[3px] ${styles[variant]}`}>
      <Icon name={icon} size={13} />
      <span className="font-display text-[13px] font-extrabold leading-none">{value}</span>
      <span className="text-[10.5px] font-bold leading-none">{unit}</span>
    </span>
  );
}
