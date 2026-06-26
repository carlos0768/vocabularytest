'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import type {
  FriendProfile,
  FriendTimelineSession,
} from '@/lib/friends/types';
import type { FollowSummary, FollowsHomePayload } from '@/lib/follows/types';

type FollowsApiResponse = Partial<FollowsHomePayload> & {
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

const EMPTY_FOLLOWS: FollowsHomePayload = {
  profile: { userId: '', username: null, accountId: '' },
  following: [],
  followers: [],
  pendingIncoming: [],
  pendingOutgoing: [],
};

const AVATAR_PALETTE = [
  '#f97316', '#06b6d4', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f59e0b', '#6366f1', '#10b981',
];

function avatarColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = ((hash << 5) - hash + identifier.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
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

export default function FriendsPage() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [home, setHome] = useState<FollowsHomePayload>(EMPTY_FOLLOWS);
  const [sessions, setSessions] = useState<FriendTimelineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const hasRequests = home.pendingIncoming.length > 0 || home.pendingOutgoing.length > 0;

  const loadFollows = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/follows', { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as FollowsApiResponse | null;
      if (!response.ok || !payload?.success || !payload.profile) {
        throw new Error(payload?.error || 'follows_fetch_failed');
      }
      setHome({
        profile: payload.profile,
        following: payload.following ?? [],
        followers: payload.followers ?? [],
        pendingIncoming: payload.pendingIncoming ?? [],
        pendingOutgoing: payload.pendingOutgoing ?? [],
      });
    } catch (loadError) {
      console.warn('Failed to load follows:', loadError);
      setError('フォロー通知を読み込めませんでした。');
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
    await Promise.all([loadFollows(), loadTimeline()]);
  }, [loadFollows, loadTimeline]);

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
        throw new Error(payload?.error || 'follow_mutation_failed');
      }
      await refreshAll();
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : '操作に失敗しました。';
      setError(message);
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, refreshAll]);

  const respondRequest = (followId: string, action: 'accept' | 'decline') => mutate(`${action}:${followId}`, () => fetch('/api/follows/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followId, action }),
  }));

  const removeFollow = (followId: string) => mutate(`delete:${followId}`, () => fetch('/api/follows', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followId }),
  }));

  const toggleSession = (sessionId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

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
          <div className="mx-[18px] mb-3 flex items-center justify-between rounded-[12px] border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[13px] font-bold text-[#dc2626]">
            <span>{error}</span>
            <button type="button" onClick={() => void refreshAll()} className="ml-3 underline">再試行</button>
          </div>
        )}

        {hasRequests && (
          <div className="mb-2 px-[18px]">
            <RequestsSection
              incoming={home.pendingIncoming}
              outgoing={home.pendingOutgoing}
              actionLoading={actionLoading}
              onRespondRequest={respondRequest}
              onRemoveFollow={removeFollow}
            />
          </div>
        )}

        {sessions.map((session) => (
          <TimelineItem
            key={session.id}
            session={session}
            expanded={expanded.has(session.id)}
            onToggle={() => toggleSession(session.id)}
          />
        ))}

        {timelineLoading && (
          <div className="flex items-center justify-center py-10 text-[var(--color-muted)]">
            <Icon name="progress_activity" className="animate-spin" size={20} />
          </div>
        )}

        {!timelineLoading && sessions.length === 0 && (
          <div className="px-[18px] py-16 text-center text-[13px] font-bold text-[var(--color-muted)]">
            まだ活動がありません
          </div>
        )}

        {home.following.length > 0 && (
          <div className="mx-[18px] mt-6 border-t border-[var(--color-border)] pt-5 pb-4">
            <FollowingSection
              follows={home.following}
              actionLoading={actionLoading}
              onRemoveFollow={removeFollow}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <DesktopTopbar title="フォロー" crumb="フォロー通知 / 学習タイムライン">
          <DesktopButton href="/shared" icon="hub" variant="ghost">共有ライブラリ</DesktopButton>
        </DesktopTopbar>
        <div className="ds-scroll">
          {renderContent()}
        </div>
      </div>

      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)] lg:hidden">
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
  onRemoveFollow,
}: {
  incoming: FollowSummary[];
  outgoing: FollowSummary[];
  actionLoading: string | null;
  onRespondRequest: (followId: string, action: 'accept' | 'decline') => void;
  onRemoveFollow: (followId: string) => void;
}) {
  return (
    <SolidPanel className="!rounded-[14px]" faceClassName="!p-3">
      <SectionTitle icon="mark_email_unread" label="フォロー通知" count={incoming.length + outgoing.length} />
      <div className="mt-2 flex flex-col gap-1.5">
        {incoming.map((item) => (
          <FollowRow key={item.id} follow={item}>
            <button
              type="button"
              onClick={() => onRespondRequest(item.id, 'accept')}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border-2 border-[#059669] bg-[#059669] text-white disabled:opacity-50"
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
          </FollowRow>
        ))}
        {outgoing.map((item) => (
          <FollowRow key={item.id} follow={item}>
            <StatusChip label="申請中" />
            <button
              type="button"
              onClick={() => onRemoveFollow(item.id)}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="申請を取り消す"
            >
              <Icon name="close" size={14} />
            </button>
          </FollowRow>
        ))}
      </div>
    </SolidPanel>
  );
}

function FollowingSection({
  follows,
  actionLoading,
  onRemoveFollow,
}: {
  follows: FollowSummary[];
  actionLoading: string | null;
  onRemoveFollow: (followId: string) => void;
}) {
  return (
    <>
      <SectionTitle icon="person_check" label="フォロー中" count={follows.length} />
      <div className="mt-2 flex flex-col gap-1.5">
        {follows.map((follow) => (
          <FollowRow key={follow.id} follow={follow}>
            <button
              type="button"
              onClick={() => onRemoveFollow(follow.id)}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="フォロー解除"
            >
              <Icon name={actionLoading === `delete:${follow.id}` ? 'progress_activity' : 'person_remove'} className={actionLoading === `delete:${follow.id}` ? 'animate-spin' : ''} size={14} />
            </button>
          </FollowRow>
        ))}
      </div>
    </>
  );
}

function TimelineItem({
  session,
  expanded,
  onToggle,
}: {
  session: FriendTimelineSession;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-secondary)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3.5 px-[18px] py-4 text-left"
      >
        <Avatar profile={session.profile} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{displayName(session.profile)}</span>
            <span className="font-mono text-[11px] font-bold text-[var(--color-muted)]">@{session.profile.accountId}</span>
            <span className="text-[var(--color-border)]">·</span>
            <span className="text-[12px] font-bold text-[var(--color-muted)]">{formatSessionTime(session.startedAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <MetricChip icon="quiz" label={`${session.answerCount}問`} variant="quiz" />
            <MetricChip icon="check_circle" label={`${session.masteredCount}語 習得`} variant="mastered" />
          </div>
        </div>
        <Icon name={expanded ? 'expand_less' : 'expand_more'} size={22} className="mt-1.5 shrink-0 text-[var(--color-muted)]" />
      </button>
      {expanded && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-[18px] py-4">
          <div className="pl-[52px]">
            {session.words.length > 0 ? (
              <div className="flex flex-col gap-2">
                {session.words.map((word) => (
                  <div key={word.id} className="rounded-[12px] border border-[#bbf7d0] bg-[var(--color-accent-subtle)] px-4 py-3">
                    <div className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{word.english}</div>
                    <div className="mt-0.5 text-[13px] font-bold text-[var(--color-muted)]">{word.japanese}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-4 text-center text-[13px] font-bold text-[var(--color-muted)]">
                習得済みに変わった単語はありません
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function FollowRow({
  follow,
  children,
}: {
  follow: FollowSummary;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-2.5 py-2">
      <Avatar profile={follow.profile} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-extrabold text-[var(--solid-ink)]">{displayName(follow.profile)}</div>
        <div className="truncate font-mono text-[10px] font-bold text-[var(--color-muted)]">@{follow.profile.accountId}</div>
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

function MetricChip({
  icon,
  label,
  variant = 'default',
}: {
  icon: string;
  label: string;
  variant?: 'quiz' | 'mastered' | 'default';
}) {
  const styles = {
    quiz: 'border-[#bbf7d0] bg-[var(--color-accent-light)] text-[var(--color-accent)]',
    mastered: 'border-[#fde68a] bg-[#fef3c7] text-[#92400e]',
    default: 'border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${styles[variant]}`}>
      <Icon name={icon} size={13} />
      {label}
    </span>
  );
}
