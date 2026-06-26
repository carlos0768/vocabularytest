'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DesktopSharedView } from '@/components/desktop/DesktopShared';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { ShareTypeChooser } from './ShareTypeChooser';
import type {
  SharedDiscoverCategory,
  SharedDiscoverPayload,
  SharedProjectCard,
} from '@/lib/shared-projects/types';
import type { FollowSearchResult, FollowSummary } from '@/lib/follows/types';
import type { PublicStudyGroupSummary, StudyGroupSummary } from '@/lib/shared-projects/types';
import { formatSharedTag } from '../../../shared/shared-tags';

type SharedPageClientProps = {
  initialDiscover: SharedDiscoverPayload;
};

type DiscoverResponse = SharedDiscoverPayload | { error?: string };

type ShareCategory = Exclude<SharedDiscoverCategory, 'all'>;
type PageCategory = ShareCategory | 'groups';

const CATEGORY_META: Record<PageCategory, { label: string; icon: string; description: string }> = {
  users: { label: 'ユーザー', icon: 'person', description: '学習者をフォロー' },
  projects: { label: '単語帳', icon: 'menu_book', description: '公開されている単語帳' },
  groups: { label: 'グループ検索', icon: 'groups', description: '公開グループを探す' },
};

type FollowSearchApiResponse = {
  success?: boolean;
  results?: FollowSearchResult[];
  error?: string;
};

type FollowMutationResponse = {
  success?: boolean;
  follow?: FollowSummary;
  error?: string;
};

type FollowsHomeApiResponse = {
  success?: boolean;
  following?: FollowSummary[];
  pendingOutgoing?: FollowSummary[];
  error?: string;
};

type GroupSearchApiResponse = {
  success?: boolean;
  groups?: PublicStudyGroupSummary[];
  nextCursor?: string | null;
  error?: string;
};

type MyGroupsApiResponse = {
  success?: boolean;
  groups?: StudyGroupSummary[];
  error?: string;
};

const EMPTY_DISCOVER: SharedDiscoverPayload = {
  category: 'all',
  users: [],
  projects: [],
  groups: [],
  nextCursor: null,
};

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

function buildDiscoverUrl(category: SharedDiscoverCategory, query: string, cursor?: string | null) {
  const params = new URLSearchParams({ category, limit: '12' });
  if (query.trim()) params.set('q', query.trim());
  if (cursor) params.set('cursor', cursor);
  return `/api/shared-projects/discover?${params.toString()}`;
}

function mergeDiscoverPage(current: SharedDiscoverPayload, incoming: SharedDiscoverPayload): SharedDiscoverPayload {
  const projectIds = new Set(current.projects.map((item) => item.project.id));
  const userIds = new Set(current.users.map((item) => item.userId));

  return {
    ...incoming,
    users: [...current.users, ...incoming.users.filter((item) => !userIds.has(item.userId))],
    projects: [...current.projects, ...incoming.projects.filter((item) => !projectIds.has(item.project.id))],
  };
}

function isDiscoverPayload(payload: DiscoverResponse | null): payload is SharedDiscoverPayload {
  return Boolean(payload && 'category' in payload && Array.isArray(payload.projects));
}

export default function SharedPageClient({ initialDiscover }: SharedPageClientProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [category, setCategory] = useState<SharedDiscoverCategory | 'groups'>('all');
  const [query, setQuery] = useState('');
  const [discover, setDiscover] = useState<SharedDiscoverPayload>(initialDiscover);
  const [loading, setLoading] = useState(false);

  const [groupQuery, setGroupQuery] = useState('');
  const [groupResults, setGroupResults] = useState<PublicStudyGroupSummary[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<FollowSearchResult[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce] = useState(0);
  const hasUsedInitialRef = useRef(false);

  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    if (category === 'groups') return;

    const canUseInitial = !hasUsedInitialRef.current && category === 'all' && !query.trim() && refreshNonce === 0;
    if (canUseInitial) {
      hasUsedInitialRef.current = true;
      setDiscover(initialDiscover);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(buildDiscoverUrl(category, query), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as DiscoverResponse | null;
        if (!response.ok || !isDiscoverPayload(payload)) {
          throw new Error(payload && 'error' in payload ? payload.error : 'shared_discover_failed');
        }
        startTransition(() => setDiscover(payload));
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        console.error('Failed to discover shared projects:', loadError);
        setDiscover({ ...EMPTY_DISCOVER, category });
        setError('共有ライブラリを読み込めませんでした。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [category, initialDiscover, query, refreshNonce]);

  async function handleLoadMore() {
    if (category === 'all' || category === 'groups' || !discover.nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const response = await fetch(buildDiscoverUrl(category, query, discover.nextCursor), { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as DiscoverResponse | null;
      if (!response.ok || !isDiscoverPayload(payload)) {
        throw new Error(payload && 'error' in payload ? payload.error : 'shared_discover_more_failed');
      }
      startTransition(() => setDiscover((current) => mergeDiscoverPage(current, payload)));
    } catch (loadError) {
      console.error('Failed to load more shared results:', loadError);
      setError('追加の検索結果を読み込めませんでした。');
    } finally {
      setLoadingMore(false);
    }
  }

  function handleOpenShareSheet() {
    setChooserOpen(true);
  }

  function handleSelectCategory(nextCategory: PageCategory) {
    setCategory(nextCategory);
    setError(null);
  }

  function handleBackToAll() {
    setCategory('all');
    setError(null);
  }

  async function handleGroupSearch() {
    const trimmed = groupQuery.trim();
    setGroupLoading(true);
    setGroupError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (trimmed) params.set('q', trimmed);
      const response = await fetch(`/api/shared-projects/groups/public?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as GroupSearchApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'group_search_failed');
      }
      setGroupResults(payload.groups ?? []);
    } catch {
      setGroupError('グループ検索に失敗しました。');
      setGroupResults([]);
    } finally {
      setGroupLoading(false);
    }
  }

  async function handleUserSearch() {
    const trimmed = userQuery.trim();
    if (!trimmed) return;
    setUserLoading(true);
    setUserError(null);
    try {
      const params = new URLSearchParams({ q: trimmed });
      const response = await fetch(`/api/follows/search?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as FollowSearchApiResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'user_search_failed');
      }
      setUserResults(payload.results ?? []);
    } catch {
      setUserError('ユーザー検索に失敗しました。');
      setUserResults([]);
    } finally {
      setUserLoading(false);
    }
  }

  const hasQuery = query.trim().length > 0;
  const allEmpty = discover.users.length === 0 && discover.projects.length === 0;
  const shouldShowResults = category !== 'all' || hasQuery || loading || Boolean(error);

  return (
    <>
      <DesktopSharedView
        category={category === 'groups' ? 'all' : category}
        query={query}
        payload={discover}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        onQueryChange={setQuery}
        onCategorySelect={handleSelectCategory}
        onBackToAll={handleBackToAll}
        onLoadMore={() => void handleLoadMore()}
        onOpenShareSheet={handleOpenShareSheet}
      />

      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
        <div className="px-[18px] pb-2 pt-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
                COMMUNITY
              </div>
              <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] text-[var(--solid-ink)]">
                共有単語帳
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenShareSheet}
              aria-label="単語帳を共有"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="add" size={20} />
            </button>
          </div>
        </div>

        {category !== 'groups' && category !== 'users' && (
          <div className="px-[14px] pt-2">
            <label className="flex min-w-0 items-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[var(--color-muted)]">
              <Icon name="search" size={16} />
              <span className="sr-only">共有ライブラリを検索</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={category === 'all' ? 'ユーザー・単語帳を検索' : `${CATEGORY_META[category].label}を検索`}
                className="min-w-0 flex-1 bg-transparent text-[13px] font-bold text-[var(--solid-ink)] outline-none placeholder:font-semibold placeholder:text-[var(--color-muted)]"
              />
            </label>
          </div>
        )}

        {category === 'all' ? (
          <div className="grid grid-cols-3 gap-2 px-[14px] py-3">
            {(Object.keys(CATEGORY_META) as PageCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectCategory(key)}
                className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-2 py-3 text-left transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <Icon name={CATEGORY_META[key].icon} size={19} className="text-[var(--solid-ink)]" />
                <div className="mt-2 text-[12px] font-extrabold text-[var(--solid-ink)]">{CATEGORY_META[key].label}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-[14px] py-3">
            <button
              type="button"
              onClick={handleBackToAll}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
              aria-label="カテゴリ一覧に戻る"
            >
              <Icon name="arrow_back" size={15} />
            </button>
            <div>
              <div className="text-[15px] font-extrabold text-[var(--solid-ink)]">{CATEGORY_META[category].label}</div>
              <div className="text-[10px] font-semibold text-[var(--color-muted)]">{CATEGORY_META[category].description}</div>
            </div>
          </div>
        )}

        {category === 'all' && <JoinedGroupsSection />}

        {category === 'groups' ? (
          <GroupSearchSection
            groupQuery={groupQuery}
            groupResults={groupResults}
            groupLoading={groupLoading}
            groupError={groupError}
            onQueryChange={setGroupQuery}
            onSearch={() => void handleGroupSearch()}
          />
        ) : category === 'users' ? (
          <UserSearchSection
            userQuery={userQuery}
            userResults={userResults}
            userLoading={userLoading}
            userError={userError}
            onQueryChange={setUserQuery}
            onSearch={() => void handleUserSearch()}
          />
        ) : shouldShowResults && (
          <div className="flex flex-col gap-4 px-[14px]">
            {error && <ErrorBox message={error} />}
            {loading ? (
              <LoadingBox />
            ) : allEmpty ? (
              <EmptyBox message="検索結果がありません" />
            ) : category === 'all' ? (
              <>
                <UserSection users={discover.users} />
                <ProjectSection projects={discover.projects} />
              </>
            ) : (
              <>
                {category === 'projects' && <ProjectSection projects={discover.projects} />}
                {discover.nextCursor && (
                  <button
                    type="button"
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                    className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-3 text-sm font-bold text-[var(--solid-ink)] disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon name={loadingMore ? 'progress_activity' : 'expand_more'} size={18} className={loadingMore ? 'animate-spin' : undefined} />
                      {loadingMore ? '読み込み中...' : 'もっと見る'}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ShareTypeChooser
        open={chooserOpen}
        isLoggedIn={Boolean(user)}
        onClose={() => setChooserOpen(false)}
        onLogin={() => {
          setChooserOpen(false);
          router.push('/login?redirect=/shared');
        }}
      />
    </>
  );
}

function SectionLabel({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <Icon name={icon} size={13} className="text-[var(--color-muted)]" />
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </div>
      <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">{count}</span>
    </div>
  );
}

function UserSection({ users }: { users: SharedDiscoverPayload['users'] }) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [followLoading, setFollowLoading] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || users.length === 0) {
      setFollowedIds(new Set());
      setPendingIds(new Set());
      return;
    }

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
        if (!cancelled) console.error('Failed to load follow state for shared users:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, users]);

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
        setFollowedIds((prev) => {
          const next = new Set(prev);
          next.delete(accountId);
          return next;
        });
        showToast({ message: 'フォローリクエストを送信しました', type: 'success' });
      } else {
        setFollowedIds((prev) => new Set([...prev, accountId]));
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(accountId);
          return next;
        });
        showToast({ message: 'フォローしました', type: 'success' });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'フォローに失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setFollowLoading(null);
    }
  };

  if (users.length === 0) return null;
  return (
    <section>
      <SectionLabel icon="person" label="ユーザー" count={users.length} />
      <div className="divide-y divide-[var(--color-border)]">
        {users.map((user) => {
          const accountLabel = user.accountId ? `@${user.accountId}` : user.username ? `@${user.username}` : 'ユーザー';
          const avatarLabel = (user.accountId ?? user.username ?? 'U').charAt(0).toUpperCase();
          const isFollowed = followedIds.has(user.accountId ?? '');
          const isPending = pendingIds.has(user.accountId ?? '');
          const isLoading = followLoading === user.accountId;

          return (
            <div key={user.userId} className="flex items-center gap-3 px-1 py-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[14px] font-extrabold text-white"
                style={{ backgroundColor: thumbColor(user.userId) }}
              >
                {avatarLabel}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12px] font-extrabold text-[var(--solid-ink)]">
                  {accountLabel}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">
                  {user.username ?? 'アカウント'}
                </div>
              </div>
              {isAuthenticated && user.accountId && (
                isFollowed ? (
                  <span className="inline-flex h-7 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 text-[10px] font-bold text-[var(--color-muted)]">フォロー中</span>
                ) : isPending ? (
                  <span className="inline-flex h-7 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 text-[10px] font-bold text-[var(--color-muted)]">申請中</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleFollow(user.accountId)}
                    disabled={Boolean(followLoading)}
                    className="inline-flex h-7 items-center gap-1 rounded-[7px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-2 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    <Icon name={isLoading ? 'progress_activity' : 'person_add'} className={isLoading ? 'animate-spin' : ''} size={13} />
                    フォロー
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProjectSection({ projects }: { projects: SharedProjectCard[] }) {
  if (projects.length === 0) return null;
  return (
    <section>
      <SectionLabel icon="menu_book" label="単語帳" count={projects.length} />
      <div className="flex flex-col gap-2">
        {projects.map((project) => <ProjectCard key={project.project.id} project={project} />)}
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const bg = thumbColor(project.project.id);
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerAccountId
      ? `@${project.ownerAccountId}`
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';

  return (
    <Link href={href} className="block">
      <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-3 transition-all duration-100 active:translate-x-px active:translate-y-px">
        <div className="flex items-center gap-[11px]">
          <div
            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[10px] border-2 bg-cover bg-center font-display text-[22px] font-extrabold text-white"
            style={{
              backgroundColor: bg,
              backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
              borderColor: 'var(--solid-ink)',
            }}
          >
            {!project.project.iconImage && project.project.title.charAt(0)}
          </div>

          <div className="min-w-0 flex-1">
            <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-display text-[14px] font-bold text-[var(--solid-ink)]">
              {project.project.title}
            </span>
            <div className="mt-[3px] flex items-center gap-1.5">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--color-muted)]">
                {ownerLabel}
              </span>
              <span className="text-[11px] text-[var(--color-muted)] opacity-50">.</span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
                {project.wordCount === undefined ? '読込中' : `${project.wordCount} 語`}
              </span>
            </div>
          </div>

          <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
        </div>

        {(project.project.sharedTags ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-[61px]">
            {project.project.sharedTags!.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-muted)]">
                {formatSharedTag(tag)}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function LoadingBox() {
  return (
    <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-5 text-sm font-bold text-[var(--color-muted)]">
      <Icon name="progress_activity" size={16} className="mr-1 inline animate-spin" />
      検索中...
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
      {message}
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-12 text-center text-sm font-bold text-[var(--color-muted)]">
      {message}
    </div>
  );
}

function UserSearchSection({
  userQuery,
  userResults,
  userLoading,
  userError,
  onQueryChange,
  onSearch,
}: {
  userQuery: string;
  userResults: FollowSearchResult[];
  userLoading: boolean;
  userError: string | null;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [followLoading, setFollowLoading] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  const handleFollow = async (accountId: string) => {
    if (followLoading) return;
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
      setFollowedIds((prev) => new Set([...prev, accountId]));
      showToast({ message: 'フォローリクエストを送信しました', type: 'success' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'フォローに失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setFollowLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-[14px]">
      <form
        onSubmit={(e) => { e.preventDefault(); onSearch(); }}
        className="flex gap-2"
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5">
          <Icon name="search" size={16} className="shrink-0 text-[var(--color-muted)]" />
          <input
            value={userQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ユーザー名・IDで検索"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-bold text-[var(--solid-ink)] outline-none placeholder:font-semibold placeholder:text-[var(--color-muted)]"
          />
        </label>
        <button
          type="submit"
          disabled={userLoading || !userQuery.trim()}
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white disabled:opacity-50"
          aria-label="検索"
        >
          <Icon name={userLoading ? 'progress_activity' : 'arrow_forward'} className={userLoading ? 'animate-spin' : ''} size={16} />
        </button>
      </form>

      {userError && <ErrorBox message={userError} />}

      {userLoading && userResults.length === 0 && <LoadingBox />}

      {userResults.length > 0 && (
        <div className="divide-y divide-[var(--color-border)]">
          {userResults.map((result) => {
            const isFollowed = followedIds.has(result.accountId) || result.relationship === 'following' || result.relationship === 'mutual';
            const isPending = result.relationship === 'pending';
            const isLoading = followLoading === result.accountId;

            return (
              <div key={result.userId} className="flex items-center gap-3 px-1 py-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[14px] font-extrabold text-white"
                  style={{ backgroundColor: thumbColor(result.userId) }}
                >
                  {(result.accountId ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[12px] font-extrabold text-[var(--solid-ink)]">
                    @{result.accountId}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">
                    {result.username ?? 'アカウント'}
                  </div>
                </div>
                {isAuthenticated && (
                  isFollowed ? (
                    <span className="inline-flex h-7 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 text-[10px] font-bold text-[var(--color-muted)]">フォロー中</span>
                  ) : isPending ? (
                    <span className="inline-flex h-7 items-center rounded-[7px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 text-[10px] font-bold text-[var(--color-muted)]">申請中</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleFollow(result.accountId)}
                      disabled={Boolean(followLoading)}
                      className="inline-flex h-7 items-center gap-1 rounded-[7px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-2 text-[11px] font-bold text-white disabled:opacity-50"
                    >
                      <Icon name={isLoading ? 'progress_activity' : 'person_add'} className={isLoading ? 'animate-spin' : ''} size={13} />
                      フォロー
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      {!userLoading && userResults.length === 0 && userQuery.trim() && !userError && (
        <EmptyBox message="ユーザーが見つかりませんでした" />
      )}

      {!userQuery.trim() && !userLoading && (
        <div className="py-8 text-center text-[13px] font-bold text-[var(--color-muted)]">
          ユーザー名またはIDで検索してください
        </div>
      )}
    </div>
  );
}

function JoinedGroupsSection() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<StudyGroupSummary[]>([]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    fetch('/api/shared-projects/groups', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as MyGroupsApiResponse | null;
        if (!response.ok || !payload?.success) throw new Error(payload?.error || 'my_groups_failed');
        if (!cancelled) setGroups(payload.groups ?? []);
      })
      .catch((error) => {
        if (!cancelled) console.warn('Failed to load joined groups:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated]);

  if (!isAuthenticated || groups.length === 0) return null;

  return (
    <div className="px-[14px] pb-1 pt-3">
      <SectionLabel icon="groups" label="参加中のグループ" count={groups.length} />
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <Link key={group.id} href={`/groups/${group.id}`} className="block">
            <div className="flex items-center gap-3 rounded-xl border-2 border-[var(--solid-ink)] bg-white p-3 transition-all duration-100 active:translate-x-px active:translate-y-px">
              <div
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[20px] font-extrabold text-white"
                style={{ backgroundColor: thumbColor(group.id) }}
              >
                {group.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">{group.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
                  <span className="flex items-center gap-0.5"><Icon name="group" size={12} />{group.memberCount}人</span>
                  <span className="flex items-center gap-0.5"><Icon name="menu_book" size={12} />{group.projectCount}冊</span>
                  {group.role === 'owner' && (
                    <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-muted)]">owner</span>
                  )}
                </div>
              </div>
              <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function GroupSearchSection({
  groupQuery,
  groupResults,
  groupLoading,
  groupError,
  onQueryChange,
  onSearch,
}: {
  groupQuery: string;
  groupResults: PublicStudyGroupSummary[];
  groupLoading: boolean;
  groupError: string | null;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
}) {
  useEffect(() => {
    onSearch();
  }, []);

  return (
    <div className="flex flex-col gap-3 px-[14px]">
      <form
        onSubmit={(e) => { e.preventDefault(); onSearch(); }}
        className="flex gap-2"
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5">
          <Icon name="search" size={16} className="shrink-0 text-[var(--color-muted)]" />
          <input
            value={groupQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="グループ名で検索"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-bold text-[var(--solid-ink)] outline-none placeholder:font-semibold placeholder:text-[var(--color-muted)]"
          />
        </label>
        <button
          type="submit"
          disabled={groupLoading}
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white disabled:opacity-50"
          aria-label="検索"
        >
          <Icon name={groupLoading ? 'progress_activity' : 'arrow_forward'} className={groupLoading ? 'animate-spin' : ''} size={16} />
        </button>
      </form>

      {groupError && <ErrorBox message={groupError} />}

      {groupLoading && groupResults.length === 0 && <LoadingBox />}

      {groupResults.length > 0 && (
        <div className="flex flex-col gap-2">
          {groupResults.map((group) => (
            <div key={group.id} className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] font-display text-[16px] font-extrabold text-white"
                  style={{ backgroundColor: thumbColor(group.id) }}
                >
                  {group.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-extrabold text-[var(--solid-ink)]">{group.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
                    <span className="flex items-center gap-0.5">
                      <Icon name="group" size={12} />
                      {group.memberCount}人
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Icon name="menu_book" size={12} />
                      {group.projectCount}冊
                    </span>
                    {group.ownerUsername && (
                      <span className="truncate">@{group.ownerUsername}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!groupLoading && groupResults.length === 0 && !groupError && (
        <EmptyBox message="公開グループがありません" />
      )}
    </div>
  );
}
