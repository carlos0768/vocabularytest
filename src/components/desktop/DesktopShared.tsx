'use client';

import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DesktopButton, DesktopSearchBox } from '@/components/desktop/DesktopChrome';
import { FollowNotificationsButton } from '@/components/notifications/FollowNotificationsButton';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { formatSharedTag } from '../../../shared/shared-tags';
import type { FollowSummary } from '@/lib/follows/types';
import type {
  PublicStudyGroupSummary,
  SharedDiscoverCategory,
  SharedDiscoverPayload,
  SharedProjectCard,
  SharedUserSummary,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';

type DesktopSharedCategory = Exclude<SharedDiscoverCategory, 'all'> | 'groups';

const CATEGORY_META: Record<DesktopSharedCategory, { label: string; icon: string; description: string }> = {
  users: { label: 'ユーザー', icon: 'person', description: '学習者アカウント' },
  projects: { label: '単語帳', icon: 'menu_book', description: 'みんなが公開している単語帳' },
  groups: { label: 'グループ検索', icon: 'groups', description: '公開グループを探して参加' },
};

const FEED_PAGE_SIZE = 12;

export function DesktopSharedView({
  category,
  query,
  payload,
  loading,
  loadingMore,
  error,
  joinedGroups,
  groupQuery,
  groupResults,
  groupLoading,
  groupError,
  onGroupQueryChange,
  onGroupSearch,
  onQueryChange,
  onCategorySelect,
  onBackToAll,
  onLoadMore,
  onOpenShareSheet,
  onProjectMissing,
}: {
  category: SharedDiscoverCategory | 'groups';
  query: string;
  payload: SharedDiscoverPayload;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  joinedGroups: StudyGroupSummary[];
  groupQuery: string;
  groupResults: PublicStudyGroupSummary[];
  groupLoading: boolean;
  groupError: string | null;
  onGroupQueryChange: (value: string) => void;
  onGroupSearch: () => void;
  onQueryChange: (value: string) => void;
  onCategorySelect: (category: DesktopSharedCategory) => void;
  onBackToAll: () => void;
  onLoadMore: () => void;
  onOpenShareSheet: () => void;
  onProjectMissing: (projectId: string) => void;
}) {
  const isCategory = category !== 'all';
  const isGroups = category === 'groups';
  const activeMeta = isCategory ? CATEGORY_META[category] : null;
  const hasQuery = query.trim().length > 0;
  const shouldShowResults = !isGroups && (isCategory || hasQuery || loading || Boolean(error));
  const showDashboard = category === 'all' && !hasQuery;

  const isDesktop = useIsDesktop();
  const dashboardActive = isDesktop && showDashboard;
  const feed = useDiscoverFeed(dashboardActive);
  const publicGroups = usePublicGroupsPreview(dashboardActive);

  const handleFeedProjectMissing = (projectId: string) => {
    feed.remove(projectId);
    onProjectMissing(projectId);
  };

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <div
        className="ds-top"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 420px) minmax(0, 1fr)',
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="crumb">{isCategory ? `共有ライブラリ / ${activeMeta!.label}` : 'コレクション / 探す'}</div>
          <h1>{isCategory ? activeMeta!.label : '共有ライブラリ'}</h1>
        </div>
        {isGroups ? (
          <form
            onSubmit={(event) => { event.preventDefault(); onGroupSearch(); }}
            style={{ display: 'flex', gap: 8, minWidth: 0 }}
          >
            <DesktopSearchBox
              placeholder="グループ名で検索"
              value={groupQuery}
              onChange={(event) => onGroupQueryChange(event.target.value)}
              style={{ width: '100%', minWidth: 0 }}
            />
            <button type="submit" className="ds-btn dark" disabled={groupLoading} aria-label="グループを検索">
              <Icon name={groupLoading ? 'progress_activity' : 'arrow_forward'} className={groupLoading ? 'animate-spin' : undefined} />
            </button>
          </form>
        ) : (
          <DesktopSearchBox
            placeholder={isCategory ? `${activeMeta!.label}を検索` : 'ユーザー・単語帳を検索'}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            style={{ width: '100%', minWidth: 0 }}
          />
        )}
        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FollowNotificationsButton variant="desktop" />
          <DesktopButton variant="dark" icon="add" onClick={onOpenShareSheet}>
            共有
          </DesktopButton>
        </div>
      </div>

      {showDashboard ? (
        <div
          className="ds-scroll"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 26, alignItems: 'start' }}
        >
          <div style={{ minWidth: 0 }}>
            {error && (
              <div className="ds-card" style={{ marginBottom: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                {error}
              </div>
            )}

            <CategoryChipRow onCategorySelect={onCategorySelect} onQueryChange={onQueryChange} />

            <JoinedGroupGrid groups={joinedGroups} columns={2} />

            <DiscoverFeed
              feed={feed}
              onProjectMissing={handleFeedProjectMissing}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, position: 'sticky', top: 0 }}>
            <PopularWordbooksRail projects={feed.projects.length > 0 ? feed.projects : payload.projects} />
            <WhoToFollowRail users={payload.users} enabled={dashboardActive} onSeeAll={() => onCategorySelect('users')} />
            <PublicGroupsRail
              groups={publicGroups.groups}
              loading={publicGroups.loading}
              joinedGroups={joinedGroups}
              onSeeAll={() => onCategorySelect('groups')}
            />
            <TrendingTagsRail projects={feed.projects} onSelectTag={onQueryChange} />
          </div>
        </div>
      ) : (
        <div className="ds-scroll">
          {isCategory && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <button type="button" className="ds-btn ghost" onClick={onBackToAll}>
                <Icon name="arrow_back" />
                戻る
              </button>
              <div className="muted" style={{ fontSize: 13 }}>
                {activeMeta!.description}
              </div>
            </div>
          )}

          {isGroups && (
            <GroupSearchResults
              joinedGroups={joinedGroups}
              groupResults={groupResults}
              groupLoading={groupLoading}
              groupError={groupError}
            />
          )}

          {shouldShowResults && (
            <>
              {error && (
                <div className="ds-card" style={{ marginBottom: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                  {error}
                </div>
              )}

              {loading ? (
                <div className="ds-card" style={{ padding: 34, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="progress_activity" className="animate-spin" />
                  検索中...
                </div>
              ) : isCategory ? (
                <CategoryResults
                  category={category as Exclude<SharedDiscoverCategory, 'all'>}
                  payload={payload}
                  onLoadMore={onLoadMore}
                  loadingMore={loadingMore}
                  onProjectMissing={onProjectMissing}
                />
              ) : hasQuery ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                  <UserGrid users={payload.users} />
                  <ProjectGrid projects={payload.projects} onProjectMissing={onProjectMissing} />
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============ Dashboard data hooks ============

// The desktop view stays mounted (CSS-hidden) on mobile, so dashboard-only
// fetches are gated behind an actual viewport check.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

type DiscoverFeedState = {
  projects: SharedProjectCard[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => void;
  remove: (projectId: string) => void;
};

type DiscoverFeedResponse = {
  projects?: SharedProjectCard[];
  nextCursor?: string | null;
};

// Newest public wordbooks, paginated — the dashboard's central feed. Fetched
// once per session on the first desktop render of the discover top view.
function useDiscoverFeed(enabled: boolean): DiscoverFeedState {
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const loading = enabled && !settled;

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    fetch(`/api/shared-projects/discover?category=projects&limit=${FEED_PAGE_SIZE}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as DiscoverFeedResponse | null;
        if (!response.ok || !payload || !Array.isArray(payload.projects)) throw new Error('feed_failed');
        setProjects(payload.projects);
        setNextCursor(payload.nextCursor ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('単語帳を読み込めませんでした。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true);
      });

    return () => controller.abort();
  }, [enabled]);

  const loadMore = () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    fetch(`/api/shared-projects/discover?category=projects&limit=${FEED_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as DiscoverFeedResponse | null;
        if (!response.ok || !payload || !Array.isArray(payload.projects)) throw new Error('feed_more_failed');
        setProjects((current) => {
          const known = new Set(current.map((item) => item.project.id));
          return [...current, ...payload.projects!.filter((item) => !known.has(item.project.id))];
        });
        setNextCursor(payload.nextCursor ?? null);
      })
      .catch(() => setError('追加の単語帳を読み込めませんでした。'))
      .finally(() => setLoadingMore(false));
  };

  const remove = (projectId: string) => {
    setProjects((current) => current.filter((item) => item.project.id !== projectId));
  };

  return { projects, nextCursor, loading, loadingMore, error, loadMore, remove };
}

type PublicGroupsResponse = {
  success?: boolean;
  groups?: PublicStudyGroupSummary[];
};

function usePublicGroupsPreview(enabled: boolean) {
  const [groups, setGroups] = useState<PublicStudyGroupSummary[]>([]);
  const [settled, setSettled] = useState(false);
  const startedRef = useRef(false);
  const loading = enabled && !settled;

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    fetch('/api/shared-projects/groups/public?limit=6', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PublicGroupsResponse | null;
        if (!response.ok || !payload?.success) throw new Error('public_groups_failed');
        setGroups(payload.groups ?? []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('Failed to load public groups preview:', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true);
      });

    return () => controller.abort();
  }, [enabled]);

  return { groups, loading };
}

// ============ Dashboard: main column ============

function CategoryChipRow({
  onCategorySelect,
  onQueryChange,
}: {
  onCategorySelect: (category: DesktopSharedCategory) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
      {(Object.keys(CATEGORY_META) as DesktopSharedCategory[]).map((key) => (
        <button
          key={key}
          type="button"
          className="ds-chip"
          onClick={() => onCategorySelect(key)}
          title={CATEGORY_META[key].description}
        >
          <Icon name={CATEGORY_META[key].icon} style={{ fontSize: 16 }} />
          {CATEGORY_META[key].label}
        </button>
      ))}
      <button
        type="button"
        className="ds-chip"
        onClick={() => { onCategorySelect('projects'); onQueryChange('英検'); }}
        title="英検対策の単語帳を探す"
      >
        <Icon name="school" style={{ fontSize: 16 }} />
        英検
      </button>
    </div>
  );
}

function DiscoverFeed({
  feed,
  onProjectMissing,
}: {
  feed: DiscoverFeedState;
  onProjectMissing: (projectId: string) => void;
}) {
  return (
    <section>
      <SectionTitle count={feed.projects.length}>新着の単語帳</SectionTitle>

      {feed.error && (
        <div className="ds-card" style={{ marginBottom: 12, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
          {feed.error}
        </div>
      )}

      {feed.loading && feed.projects.length === 0 ? (
        <div className="ds-card" style={{ padding: 34, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="progress_activity" className="animate-spin" />
          読み込み中...
        </div>
      ) : feed.projects.length === 0 && !feed.error ? (
        <EmptyCard label="公開されている単語帳はまだありません" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {feed.projects.map((project) => (
            <FeedProjectRow
              key={project.project.id}
              project={project}
              onProjectMissing={onProjectMissing}
            />
          ))}
        </div>
      )}

      {feed.nextCursor && (
        <button type="button" onClick={feed.loadMore} disabled={feed.loadingMore} className="ds-btn" style={{ marginTop: 16 }}>
          <Icon name={feed.loadingMore ? 'progress_activity' : 'expand_more'} className={feed.loadingMore ? 'animate-spin' : undefined} />
          {feed.loadingMore ? '読み込み中...' : 'もっと見る'}
        </button>
      )}
    </section>
  );
}

function FeedProjectRow({
  project,
  onProjectMissing,
}: {
  project: SharedProjectCard;
  onProjectMissing: (projectId: string) => void;
}) {
  const router = useRouter();
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const ownerLabel = sharedOwnerLabel(project);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const shareId = project.project.shareId;
    if (!shareId) return;

    event.preventDefault();
    const exists = await sharedProjectStillExists(shareId);
    if (exists === false) {
      onProjectMissing(project.project.id);
      return;
    }
    router.push(href);
  };

  return (
    <Link
      href={href}
      onClick={(event) => void handleClick(event)}
      className="ds-card"
      style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', textDecoration: 'none' }}
    >
      <div
        className="ds-project-icon ds-project-icon--lg"
        style={{
          background: desktopThumbColor(project.project.id),
          backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
          flexShrink: 0,
        }}
      >
        {!project.project.iconImage && project.project.title.charAt(0)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.project.title}
        </div>
        <div className="muted" style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ownerLabel}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <Icon name="menu_book" style={{ fontSize: 14 }} />{project.wordCount ?? 0} 語
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <Icon name="thumb_up" style={{ fontSize: 14 }} />{project.likeCount ?? 0}
          </span>
        </div>
        {(project.project.sharedTags ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {project.project.sharedTags!.slice(0, 4).map((tag) => (
              <span key={tag} className="ds-tag accent">{formatSharedTag(tag)}</span>
            ))}
          </div>
        )}
      </div>
      <Icon name="chevron_right" style={{ fontSize: 20, color: 'var(--color-muted)', flexShrink: 0 }} />
    </Link>
  );
}

// ============ Dashboard: right rail ============

function RailPanel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ds-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>
          <Icon name={icon} style={{ fontSize: 18 }} />
          {title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RailSeeAllButton({ label = 'すべて見る', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" className="ds-btn ghost sm" onClick={onClick} style={{ fontSize: 12 }}>
      {label}
    </button>
  );
}

function PopularWordbooksRail({ projects }: { projects: SharedProjectCard[] }) {
  const ranked = [...projects]
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0) || (b.wordCount ?? 0) - (a.wordCount ?? 0))
    .slice(0, 5);

  if (ranked.length === 0) return null;

  return (
    <RailPanel title="人気の単語帳" icon="local_fire_department">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {ranked.map((item, index) => {
          const href = item.project.shareId ? `/share/${item.project.shareId}` : '/shared';
          return (
            <Link
              key={item.project.id}
              href={href}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: index < ranked.length - 1 ? '1px solid var(--color-border)' : 'none',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: index < 3 ? 'var(--color-accent-ink)' : 'var(--color-muted)' }}>
                {index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.project.title}
                </div>
                <div className="muted" style={{ marginTop: 2, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sharedOwnerLabel(item)} · {item.wordCount ?? 0} 語
                </div>
              </div>
              <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Icon name="thumb_up" style={{ fontSize: 14 }} />{item.likeCount ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </RailPanel>
  );
}

type FollowsHomeApiResponse = {
  success?: boolean;
  following?: FollowSummary[];
  pendingOutgoing?: FollowSummary[];
  error?: string;
};

type FollowMutationResponse = {
  success?: boolean;
  follow?: FollowSummary;
  error?: string;
};

function WhoToFollowRail({
  users,
  enabled,
  onSeeAll,
}: {
  users: SharedUserSummary[];
  enabled: boolean;
  onSeeAll: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [followLoading, setFollowLoading] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const visibleUsers = users.slice(0, 5);

  useEffect(() => {
    if (!enabled || !isAuthenticated || users.length === 0) return;

    const accountIds = new Set(users.map((user) => user.accountId).filter((value): value is string => Boolean(value)));
    if (accountIds.size === 0) return;

    let cancelled = false;
    fetch('/api/follows', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as FollowsHomeApiResponse | null;
        if (!response.ok || !payload?.success) throw new Error(payload?.error || 'follows_fetch_failed');

        const nextFollowed = new Set<string>();
        const nextPending = new Set<string>();
        for (const item of payload.following ?? []) {
          const accountId = item.profile.accountId;
          if (accountId && accountIds.has(accountId)) nextFollowed.add(accountId);
        }
        for (const item of payload.pendingOutgoing ?? []) {
          const accountId = item.profile.accountId;
          if (accountId && accountIds.has(accountId)) nextPending.add(accountId);
        }

        if (!cancelled) {
          setFollowedIds(nextFollowed);
          setPendingIds(nextPending);
        }
      })
      .catch((error) => {
        if (!cancelled) console.warn('Failed to load follow state for rail:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, isAuthenticated, users]);

  const handleFollow = async (accountId: string | null) => {
    if (!accountId || followLoading) return;
    setFollowLoading(accountId);
    try {
      const response = await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const payload = await response.json().catch(() => null) as FollowMutationResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'follow_failed');
      }
      if (payload.follow?.status === 'pending') {
        setPendingIds((prev) => new Set([...prev, accountId]));
        showToast({ message: 'フォローリクエストを送信しました', type: 'success' });
      } else {
        setFollowedIds((prev) => new Set([...prev, accountId]));
        showToast({ message: 'フォローしました', type: 'success' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'フォローに失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setFollowLoading(null);
    }
  };

  if (visibleUsers.length === 0) return null;

  return (
    <RailPanel title="おすすめユーザー" icon="person_add" action={<RailSeeAllButton onClick={onSeeAll} />}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibleUsers.map((user, index) => {
          const accountLabel = user.accountId ? `@${user.accountId}` : user.username ? `@${user.username}` : 'ユーザー';
          const avatarLabel = (user.accountId ?? user.username ?? 'U').charAt(0).toUpperCase();
          const profileHref = user.accountId ? `/profile/${encodeURIComponent(user.accountId)}` : null;
          const isFollowed = followedIds.has(user.accountId ?? '');
          const isPending = pendingIds.has(user.accountId ?? '');
          const isLoading = followLoading === user.accountId;

          const identity = (
            <>
              <div
                className="ds-avatar"
                style={{ width: 36, height: 36, borderRadius: 10, background: desktopThumbColor(user.userId), flexShrink: 0 }}
              >
                {avatarLabel}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {accountLabel}
                </div>
                <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                  {user.projectCount} 冊 · {user.wordCount} 語
                </div>
              </div>
            </>
          );

          return (
            <div
              key={user.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: index < visibleUsers.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {profileHref ? (
                <Link href={profileHref} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                  {identity}
                </Link>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  {identity}
                </div>
              )}
              {isAuthenticated && user.accountId && (
                isFollowed ? (
                  <span className="ds-tag plain" style={{ flexShrink: 0 }}>フォロー中</span>
                ) : isPending ? (
                  <span className="ds-tag plain" style={{ flexShrink: 0 }}>申請中</span>
                ) : (
                  <button
                    type="button"
                    className="ds-btn dark sm"
                    onClick={() => void handleFollow(user.accountId)}
                    disabled={Boolean(followLoading)}
                    style={{ flexShrink: 0, padding: '5px 10px', fontSize: 12 }}
                  >
                    <Icon name={isLoading ? 'progress_activity' : 'person_add'} className={isLoading ? 'animate-spin' : undefined} style={{ fontSize: 15 }} />
                    フォロー
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </RailPanel>
  );
}

function PublicGroupsRail({
  groups,
  loading,
  joinedGroups,
  onSeeAll,
}: {
  groups: PublicStudyGroupSummary[];
  loading: boolean;
  joinedGroups: StudyGroupSummary[];
  onSeeAll: () => void;
}) {
  const joinedIds = new Set(joinedGroups.map((group) => group.id));
  const visibleGroups = groups.filter((group) => !joinedIds.has(group.id)).slice(0, 4);

  if (!loading && visibleGroups.length === 0) return null;

  return (
    <RailPanel title="公開グループ" icon="groups" action={<RailSeeAllButton onClick={onSeeAll} />}>
      {loading && visibleGroups.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
          <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 16 }} />
          読み込み中...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visibleGroups.map((group, index) => (
            <Link
              key={group.id}
              href={`/groups/${encodeURIComponent(group.id)}/join`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: index < visibleGroups.length - 1 ? '1px solid var(--color-border)' : 'none',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div
                className="ds-avatar"
                style={{ width: 36, height: 36, borderRadius: 10, background: desktopThumbColor(group.id), flexShrink: 0 }}
              >
                {group.name.charAt(0)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.name}
                </div>
                <div className="muted" style={{ marginTop: 2, fontSize: 11 }}>
                  {group.memberCount}人 · {group.projectCount}冊
                </div>
              </div>
              <Icon name="chevron_right" style={{ fontSize: 18, color: 'var(--color-muted)', flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
    </RailPanel>
  );
}

// Tag chips aggregated from the feed page — clicking one runs the discover
// search with the raw tag text (the API matches shared_tags).
function TrendingTagsRail({
  projects,
  onSelectTag,
}: {
  projects: SharedProjectCard[];
  onSelectTag: (tag: string) => void;
}) {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const item of projects) {
    for (const tag of item.project.sharedTags ?? []) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  const topTags = Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  if (topTags.length === 0) return null;

  return (
    <RailPanel title="人気のタグ" icon="tag">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {topTags.map(({ tag, count }) => (
          <button key={tag} type="button" className="ds-chip" onClick={() => onSelectTag(tag)}>
            {formatSharedTag(tag)}
            <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{count}</span>
          </button>
        ))}
      </div>
    </RailPanel>
  );
}

// ============ Shared helpers / search result views ============

function sharedOwnerLabel(project: SharedProjectCard): string {
  return project.accessRole === 'owner'
    ? '自分'
    : project.ownerAccountId
      ? `@${project.ownerAccountId}`
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';
}

// Joined study groups shown on the discover top view — the desktop entry
// point into each group's page (mirrors the mobile 参加中のグループ section).
function JoinedGroupGrid({ groups, columns = 3 }: { groups: StudyGroupSummary[]; columns?: number }) {
  if (groups.length === 0) return null;
  return (
    <section style={{ marginBottom: 26 }}>
      <SectionTitle count={groups.length}>参加中のグループ</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16 }}>
        {groups.map((group) => (
          <Link
            key={group.id}
            href={`/groups/${encodeURIComponent(group.id)}`}
            className="ds-card"
            style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', textDecoration: 'none' }}
          >
            <div
              className="ds-project-icon ds-project-icon--lg"
              style={{ background: desktopThumbColor(group.id) }}
            >
              {group.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.name}
                </span>
                {group.role === 'owner' && <span className="ds-tag plain">owner</span>}
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="group" style={{ fontSize: 14 }} />{group.memberCount}人
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="menu_book" style={{ fontSize: 14 }} />{group.projectCount}冊
                </span>
              </div>
            </div>
            <Icon name="chevron_right" style={{ fontSize: 20, color: 'var(--color-muted)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function GroupSearchResults({
  joinedGroups,
  groupResults,
  groupLoading,
  groupError,
}: {
  joinedGroups: StudyGroupSummary[];
  groupResults: PublicStudyGroupSummary[];
  groupLoading: boolean;
  groupError: string | null;
}) {
  // Groups the viewer already belongs to live in 参加中のグループ — no join entry needed.
  const joinedIds = new Set(joinedGroups.map((group) => group.id));
  const visibleGroups = groupResults.filter((group) => !joinedIds.has(group.id));

  if (groupError) {
    return (
      <div className="ds-card" style={{ padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
        {groupError}
      </div>
    );
  }
  if (groupLoading && visibleGroups.length === 0) {
    return (
      <div className="ds-card" style={{ padding: 34, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Icon name="progress_activity" className="animate-spin" />
        検索中...
      </div>
    );
  }
  if (visibleGroups.length === 0) {
    return <EmptyCard label="グループがありません" />;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
      {visibleGroups.map((group) => (
        <Link
          key={group.id}
          href={`/groups/${encodeURIComponent(group.id)}/join`}
          className="ds-card"
          style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', textDecoration: 'none' }}
        >
          <div
            className="ds-project-icon ds-project-icon--lg"
            style={{ background: desktopThumbColor(group.id) }}
          >
            {group.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {group.name}
            </div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Icon name="group" style={{ fontSize: 14 }} />{group.memberCount}人
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Icon name="menu_book" style={{ fontSize: 14 }} />{group.projectCount}冊
              </span>
              {group.ownerUsername && (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{group.ownerUsername}</span>
              )}
            </div>
          </div>
          <Icon name="chevron_right" style={{ fontSize: 20, color: 'var(--color-muted)', flexShrink: 0 }} />
        </Link>
      ))}
    </div>
  );
}

function CategoryResults({
  category,
  payload,
  loadingMore,
  onLoadMore,
  onProjectMissing,
}: {
  category: Exclude<SharedDiscoverCategory, 'all'>;
  payload: SharedDiscoverPayload;
  loadingMore: boolean;
  onLoadMore: () => void;
  onProjectMissing: (projectId: string) => void;
}) {
  return (
    <>
      {category === 'users' && <UserGrid users={payload.users} />}
      {category === 'projects' && <ProjectGrid projects={payload.projects} onProjectMissing={onProjectMissing} />}
      {payload.nextCursor && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} className="ds-btn" style={{ marginTop: 18 }}>
          <Icon name={loadingMore ? 'progress_activity' : 'expand_more'} className={loadingMore ? 'animate-spin' : undefined} />
          {loadingMore ? '読み込み中...' : 'もっと見る'}
        </button>
      )}
    </>
  );
}

function SectionTitle({ children, count }: { children: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{children}</h2>
      <span className="mono muted" style={{ fontSize: 12 }}>{count}</span>
    </div>
  );
}

function UserGrid({ users }: { users: SharedUserSummary[] }) {
  return (
    <section>
      <SectionTitle count={users.length}>ユーザー</SectionTitle>
      {users.length === 0 ? <EmptyCard label="該当するユーザーはいません" /> : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {users.map((user) => {
            const accountLabel = user.accountId ? `@${user.accountId}` : user.username ? `@${user.username}` : 'ユーザー';
            const avatarLabel = (user.accountId ?? user.username ?? 'U').charAt(0).toUpperCase();
            const profileHref = user.accountId ? `/profile/${encodeURIComponent(user.accountId)}` : null;
            const rowStyle = {
              display: 'grid',
              gridTemplateColumns: '42px minmax(0, 1fr)',
              alignItems: 'center',
              gap: 12,
              padding: '13px 0',
              borderBottom: '1px solid var(--color-border)',
              color: 'inherit',
              textDecoration: 'none',
            } satisfies CSSProperties;
            const rowContent = (
              <>
                <div className="ds-avatar" style={{ width: 42, height: 42, borderRadius: 12 }}>
                  {avatarLabel}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {accountLabel}
                  </div>
                  <div className="muted" style={{ marginTop: 3, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.username ?? 'アカウント'}
                  </div>
                </div>
              </>
            );

            if (profileHref) {
              return (
                <Link key={user.userId} href={profileHref} style={rowStyle}>
                  {rowContent}
                </Link>
              );
            }

            return (
              <div key={user.userId} style={rowStyle}>
                {rowContent}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

async function sharedProjectStillExists(shareId: string): Promise<boolean | null> {
  try {
    const response = await fetch(`/api/shared-projects/share/${encodeURIComponent(shareId)}?limit=0`, {
      cache: 'no-store',
    });
    if (response.status === 404) return false;
    return response.ok ? true : null;
  } catch {
    return null;
  }
}

function ProjectGrid({
  projects,
  onProjectMissing,
}: {
  projects: SharedProjectCard[];
  onProjectMissing: (projectId: string) => void;
}) {
  return (
    <section>
      <SectionTitle count={projects.length}>単語帳</SectionTitle>
      {projects.length === 0 ? <EmptyCard label="該当する単語帳はありません" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {projects.map((project) => (
            <DesktopSharedCard
              key={project.project.id}
              project={project}
              onProjectMissing={onProjectMissing}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DesktopSharedCard({
  project,
  onProjectMissing,
}: {
  project: SharedProjectCard;
  onProjectMissing: (projectId: string) => void;
}) {
  const router = useRouter();
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const ownerLabel = sharedOwnerLabel(project);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const shareId = project.project.shareId;
    if (!shareId) return;

    event.preventDefault();
    const exists = await sharedProjectStillExists(shareId);
    if (exists === false) {
      onProjectMissing(project.project.id);
      return;
    }
    router.push(href);
  };

  return (
    <Link href={href} onClick={(event) => void handleClick(event)} className="ds-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit', textDecoration: 'none' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div
          className="ds-project-icon ds-project-icon--lg"
          style={{
            background: desktopThumbColor(project.project.id),
            backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
          }}
        >
          {!project.project.iconImage && project.project.title.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{project.project.title}</div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{ownerLabel}</div>
        </div>
        <span className="ds-tag plain">公開</span>
      </div>
      {(project.project.sharedTags ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {project.project.sharedTags!.slice(0, 4).map((tag) => <span key={tag} className="ds-tag accent">{formatSharedTag(tag)}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>
          {project.wordCount ?? 0}<span style={{ fontSize: 12, color: 'var(--color-secondary-text)' }}> 語</span>
        </span>
        <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="thumb_up" style={{ fontSize: 15 }} />{project.likeCount ?? 0}
        </span>
      </div>
    </Link>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="ds-card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
      {label}
    </div>
  );
}
