'use client';

// 共有ページ (デスクトップ) の各セクション。`DesktopSharedView` が組み立てる。
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { DesktopMediaCard } from '@/components/desktop/DesktopMediaShelf';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import type { DiscoverFeedState } from '@/components/desktop/shared/use-desktop-shared-data';
import { Icon } from '@/components/ui/Icon';
import { useInfiniteScrollSentinel, type LoadMoreState } from '@/hooks/use-infinite-scroll';
import type { OfficialWordbookCard } from '@/lib/official-wordbooks/catalog';
import type {
  PublicStudyGroupSummary,
  SharedDiscoverCategory,
  SharedDiscoverPayload,
  SharedProjectCard,
  SharedUserSummary,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';
import { formatSharedTag } from '../../../../shared/shared-tags';

const TRENDING_TAG_LIMIT = 8;

// ============ Dashboard: main column ============

export function DiscoverFeed({
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
export function DesktopLoadMore({
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

export function PopularWordbooksRail({ projects }: { projects: SharedProjectCard[] }) {
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

export function PublicGroupsRail({
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
export function TrendingTagsRow({
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

export function GroupSearchResults({
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

export function OfficialWordbookGrid({
  books,
  loading,
  error,
}: {
  books: OfficialWordbookCard[];
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
    return <EmptyCard label="公開されている公式単語帳はまだありません" />;
  }

  return (
    <section>
      <SectionTitle count={books.length}>公式単語帳</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        {books.map((book) => (
          <Link
            key={book.id}
            href={`/official/${encodeURIComponent(book.slug)}`}
            className="ds-card"
            style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, color: 'inherit', textDecoration: 'none' }}
          >
            <div
              className="ds-project-icon ds-project-icon--lg"
              style={{
                background: desktopThumbColor(book.id),
                backgroundImage: book.iconImage ? `url(${book.iconImage})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {!book.iconImage && <Icon name="verified" style={{ fontSize: 22 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {book.title}
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="verified" style={{ fontSize: 14 }} />MERKEN公式
                </span>
                {book.eikenLabel && (
                  <span style={{ whiteSpace: 'nowrap' }}>{book.eikenLabel}</span>
                )}
                {book.wordCount !== null && (
                  <span className="mono" style={{ whiteSpace: 'nowrap' }}>{book.wordCount}語</span>
                )}
              </div>
            </div>
            <Icon name="chevron_right" style={{ fontSize: 20, color: 'var(--color-muted)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CategoryResults({
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

export function UserGrid({ users }: { users: SharedUserSummary[] }) {
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

export function ProjectGrid({
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
