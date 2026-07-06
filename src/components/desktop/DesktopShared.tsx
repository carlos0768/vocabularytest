'use client';

import type { CSSProperties, MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DesktopButton, DesktopSearchBox } from '@/components/desktop/DesktopChrome';
import { FollowNotificationsButton } from '@/components/notifications/FollowNotificationsButton';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import { Icon } from '@/components/ui/Icon';
import { formatSharedTag } from '../../../shared/shared-tags';
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

      <div className="ds-scroll">
        {isCategory ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <button type="button" className="ds-btn ghost" onClick={onBackToAll}>
              <Icon name="arrow_back" />
              戻る
            </button>
            <div className="muted" style={{ fontSize: 13 }}>
              {activeMeta!.description}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
            {(Object.keys(CATEGORY_META) as DesktopSharedCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onCategorySelect(key)}
                className="ds-card"
                style={{ padding: 20, textAlign: 'left', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      border: '2px solid var(--solid-ink)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--color-surface-secondary)',
                      color: 'var(--solid-ink)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={CATEGORY_META[key].icon} />
                  </span>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>{CATEGORY_META[key].label}</div>
                    <div className="muted" style={{ marginTop: 3, fontSize: 12 }}>{CATEGORY_META[key].description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {category === 'all' && !hasQuery && !loading && (
          <JoinedGroupGrid groups={joinedGroups} />
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
    </div>
  );
}

// Joined study groups shown on the discover top view — the desktop entry
// point into each group's page (mirrors the mobile 参加中のグループ section).
function JoinedGroupGrid({ groups }: { groups: StudyGroupSummary[] }) {
  if (groups.length === 0) return null;
  return (
    <section style={{ marginBottom: 26 }}>
      <SectionTitle count={groups.length}>参加中のグループ</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
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
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerAccountId
      ? `@${project.ownerAccountId}`
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';

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
