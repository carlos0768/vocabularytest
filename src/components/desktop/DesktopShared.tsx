'use client';

import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DesktopMediaCard } from '@/components/desktop/DesktopMediaShelf';
import { FollowNotificationsButton } from '@/components/notifications/FollowNotificationsButton';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import { Icon } from '@/components/ui/Icon';
import { useInfiniteScrollSentinel, type LoadMoreState } from '@/hooks/use-infinite-scroll';
import { formatSharedTag } from '../../../shared/shared-tags';
import type { PublicGrammarBookCard } from '@/lib/grammar/types';
import type {
  PublicStudyGroupSummary,
  SharedDiscoverCategory,
  SharedDiscoverPayload,
  SharedProjectCard,
  SharedUserSummary,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';

type DesktopSharedCategory = Exclude<SharedDiscoverCategory, 'all'> | 'groups' | 'grammar';

const CATEGORY_META: Record<DesktopSharedCategory, { label: string; icon: string; description: string }> = {
  users: { label: 'ユーザー', icon: 'person', description: '学習者をフォロー' },
  projects: { label: '単語帳', icon: 'menu_book', description: '公開されている単語帳' },
  grammar: { label: '語法', icon: 'rule', description: '公開されている語法問題集' },
  groups: { label: 'グループ検索', icon: 'groups', description: '公開グループを探す' },
};

const CATEGORY_COLORS: Record<DesktopSharedCategory, string> = {
  users: '#137FEC',
  projects: '#228B22',
  grammar: '#CC4D59',
  groups: '#D97340',
};

const FEED_PAGE_SIZE = 12;

/** 検索窓の「検索範囲」。カテゴリ (ユーザー / 単語帳 / 語法 / グループ) を検索時の
    オプションとして選ぶ。'all' はユーザー + 単語帳の横断検索 */
type SearchScope = 'all' | DesktopSharedCategory;

const SEARCH_SCOPES: Array<{ value: SearchScope; label: string; placeholder: string }> = [
  { value: 'all', label: 'すべて', placeholder: 'ユーザー・単語帳を検索' },
  { value: 'users', label: 'ユーザー', placeholder: 'ユーザー名・IDで検索' },
  { value: 'projects', label: '単語帳', placeholder: '単語帳名・タグで検索' },
  { value: 'grammar', label: '語法', placeholder: '問題集名・ユーザーで検索' },
  { value: 'groups', label: 'グループ', placeholder: 'グループ名で検索' },
];

const TRENDING_TAG_LIMIT = 8;

export function DesktopSharedView({
  category,
  query,
  payload,
  loading,
  error,
  joinedGroups,
  groupQuery,
  groupResults,
  groupLoading,
  groupError,
  onGroupQueryChange,
  onGroupSearch,
  grammarQuery,
  grammarBooks,
  grammarLoading,
  grammarError,
  grammarLoadMoreState,
  grammarHasMore,
  onGrammarQueryChange,
  onGrammarSearch,
  onGrammarLoadMore,
  onQueryChange,
  onCategorySelect,
  onBackToAll,
  onOpenShareSheet,
  onProjectMissing,
  loadMoreState,
  onLoadMore,
}: {
  category: SharedDiscoverCategory | 'groups' | 'grammar';
  query: string;
  payload: SharedDiscoverPayload;
  loading: boolean;
  error: string | null;
  joinedGroups: StudyGroupSummary[];
  groupQuery: string;
  groupResults: PublicStudyGroupSummary[];
  groupLoading: boolean;
  groupError: string | null;
  onGroupQueryChange: (value: string) => void;
  onGroupSearch: () => void;
  grammarQuery: string;
  grammarBooks: PublicGrammarBookCard[];
  grammarLoading: boolean;
  grammarError: string | null;
  grammarLoadMoreState: LoadMoreState;
  grammarHasMore: boolean;
  onGrammarQueryChange: (value: string) => void;
  onGrammarSearch: () => void;
  onGrammarLoadMore: () => void;
  onQueryChange: (value: string) => void;
  onCategorySelect: (category: DesktopSharedCategory) => void;
  onBackToAll: () => void;
  onOpenShareSheet: () => void;
  onProjectMissing: (projectId: string) => void;
  loadMoreState: LoadMoreState;
  onLoadMore: () => void;
}) {
  const isCategory = category !== 'all';
  const isGroups = category === 'groups';
  const isGrammar = category === 'grammar';
  const activeMeta = isCategory ? CATEGORY_META[category] : null;
  const hasQuery = query.trim().length > 0;
  const shouldShowResults = !isGroups && !isGrammar && (isCategory || hasQuery || loading || Boolean(error));
  const showDashboard = category === 'all' && !hasQuery;

  const isDesktop = useIsDesktop();
  const dashboardActive = isDesktop && showDashboard;
  const feed = useDiscoverFeed(dashboardActive);
  const publicGroups = usePublicGroupsPreview(dashboardActive);
  const publicGrammar = usePublicGrammarPreview(dashboardActive);

  const handleFeedProjectMissing = (projectId: string) => {
    feed.remove(projectId);
    onProjectMissing(projectId);
  };

  // 検索窓は1つ。検索範囲 (すべて / ユーザー / 単語帳 / 語法 / グループ) は
  // 検索時のオプションとしてセレクトで選ぶ。範囲 = ページのカテゴリ状態そのもの。
  // ユーザー・単語帳は入力に追従して検索し、語法・グループは送信 (Enter / →) で検索する。
  const scope: SearchScope = category;
  const submitToSearch = isGroups || isGrammar;
  const searchText = isGroups ? groupQuery : isGrammar ? grammarQuery : query;
  const scopeMeta = SEARCH_SCOPES.find((item) => item.value === scope) ?? SEARCH_SCOPES[0];

  const handleSearchTextChange = (value: string) => {
    if (isGroups) onGroupQueryChange(value);
    else if (isGrammar) onGrammarQueryChange(value);
    else onQueryChange(value);
  };

  const handleScopeChange = (next: SearchScope) => {
    if (next === scope) return;
    // 入力中の文字は次の範囲に引き継ぐ。語法・グループはカテゴリに入った時点で
    // 一覧側 (SharedPageClient の各セクション) が初回検索を走らせるので、ここでは
    // 検索語を渡すだけでよい。
    if (next === 'groups') onGroupQueryChange(searchText);
    else if (next === 'grammar') onGrammarQueryChange(searchText);
    else onQueryChange(searchText);
    if (next === 'all') onBackToAll();
    else onCategorySelect(next);
  };

  // タグは単語帳に付くものなので、タグ検索は「単語帳」範囲で行う。
  // 選択中のタグをもう一度押すと解除する。
  const activeTag = !isGroups && !isGrammar ? query.trim().toLowerCase() : '';
  const handleSelectTag = (tag: string) => {
    if (tag.toLowerCase() === activeTag) {
      onQueryChange('');
      return;
    }
    onQueryChange(tag);
    onCategorySelect('projects');
  };

  const searchBar = (
    <form
      role="search"
      className="ds-shared-search"
      onSubmit={(event) => {
        event.preventDefault();
        if (isGroups) onGroupSearch();
        else if (isGrammar) onGrammarSearch();
      }}
    >
      <Icon name="search" />
      <label className="scope" title="検索範囲">
        <span className="sr-only">検索範囲</span>
        <select value={scope} onChange={(event) => handleScopeChange(event.target.value as SearchScope)}>
          {SEARCH_SCOPES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <Icon name="expand_more" />
      </label>
      <input
        placeholder={scopeMeta.placeholder}
        value={searchText}
        onChange={(event) => handleSearchTextChange(event.target.value)}
        aria-label={`${scopeMeta.label}を検索`}
      />
      {submitToSearch && (
        <button
          type="submit"
          className="go"
          disabled={isGroups ? groupLoading : grammarLoading}
          aria-label={isGroups ? 'グループを検索' : '語法問題集を検索'}
        >
          <Icon
            name={(isGroups ? groupLoading : grammarLoading) ? 'progress_activity' : 'arrow_forward'}
            className={(isGroups ? groupLoading : grammarLoading) ? 'animate-spin' : undefined}
          />
        </button>
      )}
    </form>
  );

  // 人気のタグは検索窓の直下に置く (右レールの最下段だと画面外に隠れて気づけない)。
  // 語法・グループの範囲では単語帳のタグは使えないので出さない。
  const trendingTags = !isGroups && !isGrammar ? (
    <TrendingTagsRow projects={feed.projects} activeTag={activeTag} onSelectTag={handleSelectTag} />
  ) : null;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <div className="ds-top" style={{ gap: 10 }}>
        {isCategory && (
          <button type="button" className="ds-iconbtn-round sm" onClick={onBackToAll} aria-label="共有単語帳に戻る" title="戻る">
            <Icon name="arrow_back" />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crumb">{isCategory ? `COMMUNITY / ${activeMeta!.label}` : 'COMMUNITY'}</div>
          <h1>{isCategory ? activeMeta!.label : '共有単語帳'}</h1>
        </div>
        <FollowNotificationsButton variant="desktop" />
        <button type="button" className="ds-btn dark pill" onClick={onOpenShareSheet}>
          <Icon name="add" />
          共有する
        </button>
      </div>

      {showDashboard ? (
        <div className="ds-scroll">
          {searchBar}
          {trendingTags}
          <div className="ds-cat-grid">
            {(Object.keys(CATEGORY_META) as DesktopSharedCategory[]).map((key) => {
              const meta = CATEGORY_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  className="ds-cat-card"
                  style={{ background: CATEGORY_COLORS[key] }}
                  onClick={() => onCategorySelect(key)}
                >
                  <span className="t">{meta.label}</span>
                  <span className="d">{meta.description}</span>
                  <Icon name={meta.icon} className="bg" />
                </button>
              );
            })}
          </div>
          <div
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 26, alignItems: 'start', paddingTop: 22 }}
          >
          <div style={{ minWidth: 0 }}>
            {error && (
              <div className="ds-card" style={{ marginBottom: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                {error}
              </div>
            )}

            <DiscoverFeed
              feed={feed}
              onProjectMissing={handleFeedProjectMissing}
            />
          </div>

          {/* 右レール。スクロールしても画面内に留まり、レール自体が画面より
              高いときは中だけスクロールする (末尾のパネルが隠れっぱなしにならない) */}
          <div className="ds-rail ds-rail--fit" style={{ gap: 18 }}>
            <PopularWordbooksRail projects={feed.projects.length > 0 ? feed.projects : payload.projects} />
            <PublicGrammarRail
              books={publicGrammar.books}
              loading={publicGrammar.loading}
              onSeeAll={() => onCategorySelect('grammar')}
            />
            <PublicGroupsRail
              groups={publicGroups.groups}
              loading={publicGroups.loading}
              joinedGroups={joinedGroups}
              onSeeAll={() => onCategorySelect('groups')}
            />
          </div>
          </div>
        </div>
      ) : (
        <div className="ds-scroll">
          {searchBar}
          {trendingTags}
          {isCategory && (
            <div className="muted" style={{ fontSize: 13, margin: '10px 2px 18px' }}>
              {activeMeta!.description}
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

          {isGrammar && (
            <>
              <GrammarBookGrid
                books={grammarBooks}
                loading={grammarLoading}
                error={grammarError}
              />
              <DesktopLoadMore
                hasMore={grammarHasMore}
                state={grammarLoadMoreState}
                onLoadMore={onGrammarLoadMore}
              />
            </>
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
                <>
                  <CategoryResults
                    category={category as Exclude<SharedDiscoverCategory, 'all'>}
                    payload={payload}
                    onProjectMissing={onProjectMissing}
                  />
                  <DesktopLoadMore
                    hasMore={Boolean(payload.nextCursor)}
                    state={loadMoreState}
                    onLoadMore={onLoadMore}
                  />
                </>
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

type PublicGrammarResponse = {
  success?: boolean;
  items?: PublicGrammarBookCard[];
};

// ダッシュボード右レール用の公開語法問題集プレビュー。
function usePublicGrammarPreview(enabled: boolean) {
  const [books, setBooks] = useState<PublicGrammarBookCard[]>([]);
  const [settled, setSettled] = useState(false);
  const startedRef = useRef(false);
  const loading = enabled && !settled;

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    fetch('/api/grammar/public?limit=5', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as PublicGrammarResponse | null;
        if (!response.ok || !payload?.success) throw new Error('public_grammar_failed');
        setBooks(payload.items ?? []);
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.warn('Failed to load public grammar books preview:', error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true);
      });

    return () => controller.abort();
  }, [enabled]);

  return { books, loading };
}

// ============ Dashboard: main column ============

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
        <>
          <div className="ds-media-grid">
            {feed.projects.map((project) => (
              <SharedWordbookCard
                key={project.project.id}
                project={project}
                onProjectMissing={onProjectMissing}
              />
            ))}
          </div>
          <DesktopLoadMore
            hasMore={Boolean(feed.nextCursor)}
            state={feed.loadingMore ? 'loading' : feed.error ? 'error' : 'idle'}
            onLoadMore={feed.loadMore}
          />
        </>
      )}
    </section>
  );
}

/**
 * 一覧下端の無限スクロール用センチネル。表示領域に入ると自動で次ページを
 * 読み込み、失敗したときだけ手動の再読み込みボタンに切り替える。
 */
function DesktopLoadMore({
  hasMore,
  state,
  onLoadMore,
}: {
  hasMore: boolean;
  state: LoadMoreState;
  onLoadMore: () => void;
}) {
  const sentinelRef = useInfiniteScrollSentinel({
    enabled: hasMore && state === 'idle',
    onLoadMore,
  });

  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}>
      {state === 'error' ? (
        <button type="button" className="ds-btn ghost sm" onClick={onLoadMore}>
          <Icon name="refresh" />
          再読み込み
        </button>
      ) : (
        <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Icon name="progress_activity" className="animate-spin" />
          読み込み中...
        </span>
      )}
    </div>
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
  // 人気 = インポートされた数。同数のときはいいね数 → 語数で並べる
  const ranked = [...projects]
    .sort(
      (a, b) =>
        (b.importCount ?? 0) - (a.importCount ?? 0) ||
        (b.likeCount ?? 0) - (a.likeCount ?? 0) ||
        (b.wordCount ?? 0) - (a.wordCount ?? 0),
    )
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
                gridTemplateColumns: '18px 34px minmax(0, 1fr) auto',
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
              <div
                className="ds-project-icon ds-project-icon--sm"
                style={{
                  background: desktopThumbColor(item.project.id),
                  backgroundImage: item.project.iconImage ? `url(${item.project.iconImage})` : undefined,
                }}
              >
                {!item.project.iconImage && item.project.title.charAt(0)}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.project.title}
              </div>
              <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 3 }} title="インポート数">
                <Icon name="download" style={{ fontSize: 14 }} />{item.importCount ?? 0}
              </span>
            </Link>
          );
        })}
      </div>
    </RailPanel>
  );
}

function grammarOwnerLabel(book: PublicGrammarBookCard): string {
  return book.ownerAccountId
    ? `@${book.ownerAccountId}`
    : book.ownerUsername
      ? `@${book.ownerUsername}`
      : '共有ユーザー';
}

function PublicGrammarRail({
  books,
  loading,
  onSeeAll,
}: {
  books: PublicGrammarBookCard[];
  loading: boolean;
  onSeeAll: () => void;
}) {
  if (!loading && books.length === 0) return null;

  return (
    <RailPanel title="公開中の語法問題集" icon="rule" action={<RailSeeAllButton onClick={onSeeAll} />}>
      {loading && books.length === 0 ? (
        <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
          <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 16 }} />
          読み込み中...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {books.map((book, index) => (
            <Link
              key={book.id}
              href={`/grammar/share/${encodeURIComponent(book.shareId)}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: index < books.length - 1 ? '1px solid var(--color-border)' : 'none',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div
                className="ds-project-icon ds-project-icon--sm"
                style={{ background: desktopThumbColor(book.id) }}
              >
                <Icon name="rule" style={{ fontSize: 16 }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {book.title}
                </div>
                <div className="muted" style={{ marginTop: 2, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {book.questionCount}問 · {grammarOwnerLabel(book)}
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

// フィードに載っている単語帳のタグを集計したチップ列。検索窓の直下に出し、
// 押すと「単語帳」範囲でそのタグを検索する (API は shared_tags を照合する)。
function TrendingTagsRow({
  projects,
  activeTag,
  onSelectTag,
}: {
  projects: SharedProjectCard[];
  /** 選択中のタグ (小文字)。空文字なら未選択 */
  activeTag: string;
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
    .slice(0, TRENDING_TAG_LIMIT);

  if (topTags.length === 0) return null;

  return (
    <div className="ds-shared-tags" aria-label="人気のタグ">
      <span className="lb">
        <Icon name="tag" />
        人気のタグ
      </span>
      {topTags.map(({ tag, count }) => {
        const active = tag.toLowerCase() === activeTag;
        return (
          <button
            key={tag}
            type="button"
            className={active ? 'ds-chip active' : 'ds-chip'}
            aria-pressed={active}
            onClick={() => onSelectTag(tag)}
          >
            {formatSharedTag(tag)}
            <span className="n">{count}</span>
          </button>
        );
      })}
    </div>
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

function GrammarBookGrid({
  books,
  loading,
  error,
}: {
  books: PublicGrammarBookCard[];
  loading: boolean;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="ds-card" style={{ padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
        {error}
      </div>
    );
  }
  if (loading && books.length === 0) {
    return (
      <div className="ds-card" style={{ padding: 34, color: 'var(--color-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Icon name="progress_activity" className="animate-spin" />
        検索中...
      </div>
    );
  }
  if (books.length === 0) {
    return <EmptyCard label="公開されている語法問題集はまだありません" />;
  }

  return (
    <section>
      <SectionTitle count={books.length}>語法問題集</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        {books.map((book) => (
          <Link
            key={book.id}
            href={`/grammar/share/${encodeURIComponent(book.shareId)}`}
            className="ds-card"
            style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', textDecoration: 'none' }}
          >
            <div
              className="ds-project-icon ds-project-icon--lg"
              style={{ background: desktopThumbColor(book.id) }}
            >
              <Icon name="rule" style={{ fontSize: 22 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {book.title}
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="quiz" style={{ fontSize: 14 }} />{book.questionCount}問
                </span>
                {book.importCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Icon name="download" style={{ fontSize: 14 }} />{book.importCount}
                  </span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {grammarOwnerLabel(book)}
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

function CategoryResults({
  category,
  payload,
  onProjectMissing,
}: {
  category: Exclude<SharedDiscoverCategory, 'all'>;
  payload: SharedDiscoverPayload;
  onProjectMissing: (projectId: string) => void;
}) {
  return (
    <>
      {category === 'users' && <UserGrid users={payload.users} />}
      {category === 'projects' && <ProjectGrid projects={payload.projects} onProjectMissing={onProjectMissing} />}
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
        <div className="ds-media-grid">
          {projects.map((project) => (
            <SharedWordbookCard
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

// 共有単語帳カード。ホームのマイ単語帳と同じ DesktopMediaCard を使う。
function SharedWordbookCard({
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
    <DesktopMediaCard
      href={href}
      onClick={(event) => void handleClick(event)}
      artStyle={{
        background: desktopThumbColor(project.project.id),
        backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
      }}
      artChildren={!project.project.iconImage && project.project.title.charAt(0)}
      title={project.project.title}
      subtitle={
        <>
          <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ownerLabel}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <Icon name="thumb_up" style={{ fontSize: 13 }} />{project.likeCount ?? 0}
          </span>
        </>
      }
    />
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="ds-card" style={{ padding: 32, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
      {label}
    </div>
  );
}
