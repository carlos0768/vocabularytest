'use client';

import { FollowNotificationsButton } from '@/components/notifications/FollowNotificationsButton';
import { Icon } from '@/components/ui/Icon';
import type { LoadMoreState } from '@/hooks/use-infinite-scroll';
import type { OfficialWordbookCard } from '@/lib/official-wordbooks/catalog';
import type {
  PublicStudyGroupSummary,
  SharedDiscoverCategory,
  SharedDiscoverPayload,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import {
  useDiscoverFeed,
  useIsDesktop,
  usePublicGroupsPreview,
} from '@/components/desktop/shared/use-desktop-shared-data';
import {
  CategoryResults,
  DesktopLoadMore,
  DiscoverFeed,
  GroupSearchResults,
  OfficialWordbookGrid,
  PopularWordbooksRail,
  ProjectGrid,
  PublicGroupsRail,
  TrendingTagsRow,
  UserGrid,
} from '@/components/desktop/shared/DesktopSharedSections';

type DesktopSharedCategory = Exclude<SharedDiscoverCategory, 'all'> | 'official' | 'groups';

const CATEGORY_META: Record<DesktopSharedCategory, { label: string; icon: string; description: string }> = {
  official: { label: '公式', icon: 'verified', description: 'MERKEN公式の単語帳' },
  users: { label: 'ユーザー', icon: 'person', description: '学習者をフォロー' },
  projects: { label: '単語帳', icon: 'menu_book', description: '公開されている単語帳' },
  groups: { label: 'グループ検索', icon: 'groups', description: '公開グループを探す' },
};

const CATEGORY_COLORS: Record<DesktopSharedCategory, string> = {
  official: '#664DB3',
  users: '#137FEC',
  projects: '#228B22',
  groups: '#D97340',
};
/** 検索窓の「検索範囲」。カテゴリ (ユーザー / 単語帳 / 公式 / グループ) を検索時の
    オプションとして選ぶ。'all' はユーザー + 単語帳の横断検索 */
type SearchScope = 'all' | DesktopSharedCategory;

const SEARCH_SCOPES: Array<{ value: SearchScope; label: string; placeholder: string }> = [
  { value: 'all', label: 'すべて', placeholder: 'ユーザー・単語帳を検索' },
  { value: 'users', label: 'ユーザー', placeholder: 'ユーザー名・IDで検索' },
  { value: 'projects', label: '単語帳', placeholder: '単語帳名・タグで検索' },
  { value: 'official', label: '公式', placeholder: '単語帳名・英検レベルで検索' },
  { value: 'groups', label: 'グループ', placeholder: 'グループ名で検索' },
];

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
  officialQuery,
  officialBooks,
  officialLoading,
  officialError,
  officialLoadMoreState,
  officialHasMore,
  onOfficialQueryChange,
  onOfficialSearch,
  onOfficialLoadMore,
  onQueryChange,
  onCategorySelect,
  onBackToAll,
  onOpenShareSheet,
  onProjectMissing,
  loadMoreState,
  onLoadMore,
}: {
  category: SharedDiscoverCategory | 'official' | 'groups';
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
  officialQuery: string;
  officialBooks: OfficialWordbookCard[];
  officialLoading: boolean;
  officialError: string | null;
  officialLoadMoreState: LoadMoreState;
  officialHasMore: boolean;
  onOfficialQueryChange: (value: string) => void;
  onOfficialSearch: () => void;
  onOfficialLoadMore: () => void;
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
  const isOfficial = category === 'official';
  const activeMeta = isCategory ? CATEGORY_META[category] : null;
  const hasQuery = query.trim().length > 0;
  const shouldShowResults = !isGroups && !isOfficial
    && (isCategory || hasQuery || loading || Boolean(error));
  const showDashboard = category === 'all' && !hasQuery;

  const isDesktop = useIsDesktop();
  const dashboardActive = isDesktop && showDashboard;
  const feed = useDiscoverFeed(dashboardActive);
  const publicGroups = usePublicGroupsPreview(dashboardActive);

  const handleFeedProjectMissing = (projectId: string) => {
    feed.remove(projectId);
    onProjectMissing(projectId);
  };

  // 検索窓は1つ。検索範囲 (すべて / ユーザー / 単語帳 / 公式 / グループ) は
  // 検索時のオプションとしてセレクトで選ぶ。範囲 = ページのカテゴリ状態そのもの。
  // ユーザー・単語帳は入力に追従して検索し、公式・グループは送信 (Enter / →) で検索する。
  const scope: SearchScope = category;
  const submitToSearch = isGroups || isOfficial;
  const searchText = isGroups ? groupQuery : isOfficial ? officialQuery : query;
  // 送信で検索する範囲 (公式・グループ) の進捗表示をまとめて扱う。
  const submitLoading = isGroups ? groupLoading : officialLoading;
  const scopeMeta = SEARCH_SCOPES.find((item) => item.value === scope) ?? SEARCH_SCOPES[0];

  const handleSearchTextChange = (value: string) => {
    if (isGroups) onGroupQueryChange(value);
    else if (isOfficial) onOfficialQueryChange(value);
    else onQueryChange(value);
  };

  const handleScopeChange = (next: SearchScope) => {
    if (next === scope) return;
    // 入力中の文字は次の範囲に引き継ぐ。公式・グループはカテゴリに入った時点で
    // 一覧側 (SharedPageClient の各セクション) が初回検索を走らせるので、ここでは
    // 検索語を渡すだけでよい。
    if (next === 'groups') onGroupQueryChange(searchText);
    else if (next === 'official') onOfficialQueryChange(searchText);
    else onQueryChange(searchText);
    if (next === 'all') onBackToAll();
    else onCategorySelect(next);
  };

  // タグは単語帳に付くものなので、タグ検索は「単語帳」範囲で行う。
  // 選択中のタグをもう一度押すと解除する。
  const activeTag = !isGroups && !isOfficial ? query.trim().toLowerCase() : '';
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
        else if (isOfficial) onOfficialSearch();
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
          disabled={submitLoading}
          aria-label={isGroups ? 'グループを検索' : '公式単語帳を検索'}
        >
          <Icon
            name={submitLoading ? 'progress_activity' : 'arrow_forward'}
            className={submitLoading ? 'animate-spin' : undefined}
          />
        </button>
      )}
    </form>
  );

  // 人気のタグは検索窓の直下に置く (右レールの最下段だと画面外に隠れて気づけない)。
  // 公式・グループの範囲では単語帳のタグは使えないので出さない。
  const trendingTags = !isGroups && !isOfficial ? (
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

          {isOfficial && (
            <>
              <OfficialWordbookGrid
                books={officialBooks}
                loading={officialLoading}
                error={officialError}
              />
              <DesktopLoadMore
                hasMore={officialHasMore}
                state={officialLoadMoreState}
                onLoadMore={onOfficialLoadMore}
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
// Newest public wordbooks, paginated — the dashboard's central feed. Fetched
// once per session on the first desktop render of the discover top view.
// ============ Dashboard: main column ============
// ============ Dashboard: right rail ============
// フィードに載っている単語帳のタグを集計したチップ列。検索窓の直下に出し、
// 押すと「単語帳」範囲でそのタグを検索する (API は shared_tags を照合する)。
// ============ Shared helpers / search result views ============
// 共有単語帳カード。ホームのマイ単語帳と同じ DesktopMediaCard を使う。
