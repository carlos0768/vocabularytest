'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DesktopButton, DesktopSearchBox, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { SolidPanel } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import type {
  FriendProfile,
  FriendSearchResult,
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

type SearchApiResponse = {
  success?: boolean;
  results?: FriendSearchResult[];
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

export function FriendsPanel({ embedded = false }: { embedded?: boolean }) {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [home, setHome] = useState<FriendsHomePayload>(EMPTY_FRIENDS);
  const [sessions, setSessions] = useState<FriendTimelineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const profile = home.profile.accountId ? home.profile : null;
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
      const response = await fetch('/api/friends/timeline?limit=40', { cache: 'no-store' });
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

  const runSearch = useCallback(async (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    setSearchError(null);
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/friends/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as SearchApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'friend_search_failed');
      }
      setSearchResults(payload.results ?? []);
    } catch (searchLoadError) {
      console.warn('Failed to search friends:', searchLoadError);
      setSearchError('ユーザー検索に失敗しました。');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query);
  };

  const mutate = useCallback(async (
    key: string,
    request: () => Promise<Response>,
  ) => {
    if (actionLoading) return;
    setActionLoading(key);
    setError(null);
    setSearchError(null);
    try {
      const response = await request();
      const payload = await response.json().catch(() => null) as MutationResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'friend_mutation_failed');
      }
      await refreshAll();
      if (query.trim()) await runSearch(query);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : '操作に失敗しました。';
      setSearchError(message);
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading, query, refreshAll, runSearch]);

  const sendRequest = (accountId: string) => mutate(`request:${accountId}`, () => fetch('/api/friends/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  }));

  const respondRequest = (friendshipId: string, action: 'accept' | 'decline') => mutate(`${action}:${friendshipId}`, () => fetch('/api/friends/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendshipId, action }),
  }));

  const removeFriend = (friendshipId: string) => mutate(`delete:${friendshipId}`, () => fetch(`/api/friends/${encodeURIComponent(friendshipId)}`, {
    method: 'DELETE',
  }));

  const copyAccountId = async () => {
    if (!profile?.accountId) return;
    try {
      await navigator.clipboard.writeText(`@${profile.accountId}`);
    } catch {
      // Clipboard is optional.
    }
  };

  const toggleSession = (sessionId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const renderContent = () => (
    <FriendsContent
      embedded={embedded}
      authLoading={authLoading}
      isAuthenticated={isAuthenticated}
      loading={loading}
      timelineLoading={timelineLoading}
      error={error}
      profile={profile}
      friends={home.friends}
      incoming={home.incoming}
      outgoing={home.outgoing}
      hasRequests={hasRequests}
      sessions={sessions}
      query={query}
      searchResults={searchResults}
      searchLoading={searchLoading}
      searchError={searchError}
      actionLoading={actionLoading}
      expanded={expanded}
      onQueryChange={setQuery}
      onSearchSubmit={handleSearchSubmit}
      onSendRequest={sendRequest}
      onRespondRequest={respondRequest}
      onRemoveFriend={removeFriend}
      onCopyAccountId={() => void copyAccountId()}
      onToggleSession={toggleSession}
    />
  );

  if (embedded) {
    return renderContent();
  }

  return (
    <>
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <DesktopTopbar title="フレンド" crumb="学習タイムライン">
          <DesktopButton href="/shared" icon="hub" variant="ghost">共有ライブラリ</DesktopButton>
        </DesktopTopbar>
        {renderContent()}
      </div>

      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
        <div className="px-[18px] pb-[14px] pt-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">FRIENDS</div>
          <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] text-[var(--solid-ink)]">フレンド</div>
        </div>
        {renderContent()}
      </div>
    </>
  );
}

function FriendsContent({
  embedded = false,
  authLoading,
  isAuthenticated,
  loading,
  timelineLoading,
  error,
  profile,
  friends,
  incoming,
  outgoing,
  hasRequests,
  sessions,
  query,
  searchResults,
  searchLoading,
  searchError,
  actionLoading,
  expanded,
  onQueryChange,
  onSearchSubmit,
  onSendRequest,
  onRespondRequest,
  onRemoveFriend,
  onCopyAccountId,
  onToggleSession,
}: {
  embedded?: boolean;
  authLoading: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  timelineLoading: boolean;
  error: string | null;
  profile: FriendProfile | null;
  friends: FriendshipSummary[];
  incoming: FriendshipSummary[];
  outgoing: FriendshipSummary[];
  hasRequests: boolean;
  sessions: FriendTimelineSession[];
  query: string;
  searchResults: FriendSearchResult[];
  searchLoading: boolean;
  searchError: string | null;
  actionLoading: string | null;
  expanded: Set<string>;
  onQueryChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendRequest: (accountId: string) => void;
  onRespondRequest: (friendshipId: string, action: 'accept' | 'decline') => void;
  onRemoveFriend: (friendshipId: string) => void;
  onCopyAccountId: () => void;
  onToggleSession: (sessionId: string) => void;
}) {
  if (authLoading || loading) {
    return (
      <div className={embedded ? 'flex items-center justify-center py-16 text-[var(--color-muted)]' : 'ds-scroll flex items-center justify-center px-[18px] text-[var(--color-muted)]'}>
        <Icon name="progress_activity" className="animate-spin" />
        <span className="ml-2 text-sm font-bold">読み込み中...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={embedded ? '' : 'ds-scroll px-[18px]'}>
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
    <div className={embedded ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6' : 'ds-scroll grid gap-4 px-[18px] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:px-[34px]'}>
      <main className="min-w-0">
        {error && (
          <div className="mb-4 rounded-[10px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[12px] font-bold text-[var(--color-error)]">
            {error}
          </div>
        )}
        <TimelineSection
          sessions={sessions}
          timelineLoading={timelineLoading}
          expanded={expanded}
          onToggleSession={onToggleSession}
        />
      </main>

      <aside className="flex min-w-0 flex-col gap-4">
        <ProfileSection profile={profile} onCopyAccountId={onCopyAccountId} />
        <SearchSection
          query={query}
          results={searchResults}
          loading={searchLoading}
          error={searchError}
          actionLoading={actionLoading}
          onQueryChange={onQueryChange}
          onSearchSubmit={onSearchSubmit}
          onSendRequest={onSendRequest}
        />
        {hasRequests && (
          <RequestsSection
            incoming={incoming}
            outgoing={outgoing}
            actionLoading={actionLoading}
            onRespondRequest={onRespondRequest}
            onRemoveFriend={onRemoveFriend}
          />
        )}
        <FriendsSection
          friends={friends}
          actionLoading={actionLoading}
          onRemoveFriend={onRemoveFriend}
        />
      </aside>
    </div>
  );
}

function ProfileSection({
  profile,
  onCopyAccountId,
}: {
  profile: FriendProfile | null;
  onCopyAccountId: () => void;
}) {
  if (!profile) return null;

  return (
    <SolidPanel className="!rounded-[14px]" faceClassName="!p-4">
      <div className="flex items-center gap-3">
        <Avatar profile={profile} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{displayName(profile)}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] font-bold text-[var(--color-muted)]">@{profile.accountId}</div>
        </div>
        <button
          type="button"
          onClick={onCopyAccountId}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          title="アカウントIDをコピー"
          aria-label="アカウントIDをコピー"
        >
          <Icon name="content_copy" size={16} />
        </button>
      </div>
    </SolidPanel>
  );
}

function SearchSection({
  query,
  results,
  loading,
  error,
  actionLoading,
  onQueryChange,
  onSearchSubmit,
  onSendRequest,
}: {
  query: string;
  results: FriendSearchResult[];
  loading: boolean;
  error: string | null;
  actionLoading: string | null;
  onQueryChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSendRequest: (accountId: string) => void;
}) {
  return (
    <SolidPanel className="!rounded-[14px]" faceClassName="!p-4">
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="hidden flex-1 lg:block">
          <DesktopSearchBox
            placeholder="@account_id / ユーザー名"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 lg:hidden">
          <Icon name="search" size={17} className="shrink-0 text-[var(--color-muted)]" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="@account_id / ユーザー名"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-bold outline-none placeholder:text-[var(--color-muted)]"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="検索"
        >
          <Icon name={loading ? 'progress_activity' : 'search'} className={loading ? 'animate-spin' : ''} size={18} />
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded-[8px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] font-bold text-[var(--color-error)]">
          {error}
        </div>
      )}

      <div className="mt-3 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {results.map((result) => (
          <div key={result.userId} className="flex items-center gap-2 py-2">
            <Avatar profile={result} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-extrabold text-[var(--solid-ink)]">{displayName(result)}</div>
              <div className="truncate font-mono text-[10px] font-bold text-[var(--color-muted)]">@{result.accountId}</div>
            </div>
            <SearchResultAction
              result={result}
              actionLoading={actionLoading}
              onSendRequest={onSendRequest}
            />
          </div>
        ))}
        {!loading && query.trim() && results.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-[var(--color-border)] px-3 py-5 text-center text-[12px] font-bold text-[var(--color-muted)]">
            見つかりませんでした
          </div>
        )}
      </div>
    </SolidPanel>
  );
}

function SearchResultAction({
  result,
  actionLoading,
  onSendRequest,
}: {
  result: FriendSearchResult;
  actionLoading: string | null;
  onSendRequest: (accountId: string) => void;
}) {
  if (result.relationship === 'friend') {
    return <StatusChip label="フレンド" />;
  }
  if (result.relationship === 'outgoing') {
    return <StatusChip label="申請中" />;
  }
  if (result.relationship === 'incoming') {
    return <StatusChip label="承認待ち" />;
  }

  const loading = actionLoading === `request:${result.accountId}`;
  return (
    <button
      type="button"
      onClick={() => onSendRequest(result.accountId)}
      disabled={Boolean(actionLoading)}
      className="inline-flex h-8 items-center gap-1 rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-2.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name={loading ? 'progress_activity' : 'person_add'} className={loading ? 'animate-spin' : ''} size={14} />
      申請
    </button>
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
      <SolidPanel className="!rounded-[14px]" faceClassName="!p-4">
        <SectionTitle icon="mark_email_unread" label="申請" count={incoming.length + outgoing.length} />
      <div className="mt-3 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {incoming.map((item) => (
          <FriendRow key={item.id} friendship={item}>
            <button
              type="button"
              onClick={() => onRespondRequest(item.id, 'accept')}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] text-white disabled:opacity-50"
              aria-label="承認"
            >
              <Icon name={actionLoading === `accept:${item.id}` ? 'progress_activity' : 'check'} className={actionLoading === `accept:${item.id}` ? 'animate-spin' : ''} size={15} />
            </button>
            <button
              type="button"
              onClick={() => onRespondRequest(item.id, 'decline')}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="拒否"
            >
              <Icon name="close" size={15} />
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="申請を取り消す"
            >
              <Icon name="close" size={15} />
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
      <SolidPanel className="!rounded-[14px]" faceClassName="!p-4">
        <SectionTitle icon="groups" label="フレンド" count={friends.length} />
      <div className={friends.length > 0 ? 'mt-3 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]' : 'mt-3'}>
        {friends.map((friend) => (
          <FriendRow key={friend.id} friendship={friend}>
            <button
              type="button"
              onClick={() => onRemoveFriend(friend.id)}
              disabled={Boolean(actionLoading)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:opacity-50"
              aria-label="フレンド解除"
            >
              <Icon name={actionLoading === `delete:${friend.id}` ? 'progress_activity' : 'person_remove'} className={actionLoading === `delete:${friend.id}` ? 'animate-spin' : ''} size={15} />
            </button>
          </FriendRow>
        ))}
        {friends.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-[var(--color-border)] px-3 py-5 text-center text-[12px] font-bold text-[var(--color-muted)]">
            フレンドはいません
          </div>
        )}
      </div>
    </SolidPanel>
  );
}

function TimelineSection({
  sessions,
  timelineLoading,
  expanded,
  onToggleSession,
}: {
  sessions: FriendTimelineSession[];
  timelineLoading: boolean;
  expanded: Set<string>;
  onToggleSession: (sessionId: string) => void;
}) {
  return (
    <SolidPanel className="!rounded-[14px]" faceClassName="!p-0">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <SectionTitle icon="timeline" label="タイムライン" count={sessions.length} />
        {timelineLoading && <Icon name="progress_activity" className="animate-spin text-[var(--color-muted)]" size={17} />}
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {sessions.map((session) => (
          <TimelineItem
            key={session.id}
            session={session}
            expanded={expanded.has(session.id)}
            onToggle={() => onToggleSession(session.id)}
          />
        ))}
        {!timelineLoading && sessions.length === 0 && (
          <div className="px-4 py-12 text-center text-[13px] font-bold text-[var(--color-muted)]">
            セッションはまだありません
          </div>
        )}
      </div>
    </SolidPanel>
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
    <article className="bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--color-surface-secondary)]"
      >
        <Avatar profile={session.profile} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{displayName(session.profile)}</span>
            <span className="font-mono text-[10px] font-bold text-[var(--color-muted)]">@{session.profile.accountId}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-bold text-[var(--color-muted)]">
            <span>{formatSessionTime(session.startedAt)}</span>
            <span>{formatTimeOnly(session.startedAt)}-{formatTimeOnly(session.expiresAt)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <MetricChip icon="quiz" label={`${session.answerCount}問`} />
            <MetricChip icon="check_circle" label={`${session.masteredCount}語 習得`} />
          </div>
        </div>
        <Icon name={expanded ? 'expand_less' : 'expand_more'} size={20} className="mt-1 shrink-0 text-[var(--color-muted)]" />
      </button>
      {expanded && (
        <div className="pl-[72px] pr-4 pb-4">
          {session.words.length > 0 ? (
            <div className="flex flex-col gap-2">
              {session.words.map((word) => (
                <div key={word.id} className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2">
                  <div className="font-display text-[14px] font-extrabold text-[var(--solid-ink)]">{word.english}</div>
                  <div className="mt-0.5 text-[12px] font-bold text-[var(--color-muted)]">{word.japanese}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[10px] border border-dashed border-[var(--color-border)] px-3 py-4 text-[12px] font-bold text-[var(--color-muted)]">
              習得済みに変わった単語はありません
            </div>
          )}
        </div>
      )}
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
    <div className="flex items-center gap-2 py-2">
      <Avatar profile={friendship.profile} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-extrabold text-[var(--solid-ink)]">{displayName(friendship.profile)}</div>
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
  const dimension = size === 'sm' ? 'h-9 w-9 rounded-[9px] text-[14px]' : 'h-11 w-11 rounded-[11px] text-[17px]';
  return (
    <div className={`flex shrink-0 items-center justify-center border-2 border-[var(--solid-ink)] bg-[oklch(0.72_0.12_184)] font-display font-extrabold text-white ${dimension}`}>
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
      <Icon name={icon} size={17} className="text-[var(--solid-ink)]" />
      <span className="font-display text-[14px] font-extrabold text-[var(--solid-ink)]">{label}</span>
      {typeof count === 'number' && (
        <span className="rounded-[5px] bg-[var(--solid-ink)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{count}</span>
      )}
    </div>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-8 items-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 text-[11px] font-bold text-[var(--color-muted)]">
      {label}
    </span>
  );
}

function MetricChip({
  icon,
  label,
}: {
  icon: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 py-1 text-[11px] font-extrabold text-[var(--solid-ink)]">
      <Icon name={icon} size={13} />
      {label}
    </span>
  );
}
