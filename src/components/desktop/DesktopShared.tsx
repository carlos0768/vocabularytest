'use client';

import Link from 'next/link';
import { DesktopButton, DesktopSearchBox } from '@/components/desktop/DesktopChrome';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import { Icon } from '@/components/ui/Icon';
import { formatSharedTag } from '../../../shared/shared-tags';
import type {
  SharedDiscoverCategory,
  SharedDiscoverPayload,
  SharedProjectCard,
  SharedUserSummary,
} from '@/lib/shared-projects/types';

const CATEGORY_META: Record<Exclude<SharedDiscoverCategory, 'all'>, { label: string; icon: string; description: string }> = {
  users: { label: 'ユーザー', icon: 'person', description: '学習者アカウント' },
  projects: { label: '単語帳', icon: 'menu_book', description: 'みんなが公開している単語帳' },
};

export function DesktopSharedView({
  category,
  query,
  payload,
  loading,
  loadingMore,
  error,
  onQueryChange,
  onCategorySelect,
  onBackToAll,
  onLoadMore,
  onOpenShareSheet,
}: {
  category: SharedDiscoverCategory;
  query: string;
  payload: SharedDiscoverPayload;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onCategorySelect: (category: Exclude<SharedDiscoverCategory, 'all'>) => void;
  onBackToAll: () => void;
  onLoadMore: () => void;
  onOpenShareSheet: () => void;
}) {
  const isCategory = category !== 'all';
  const activeMeta = isCategory ? CATEGORY_META[category] : null;
  const hasQuery = query.trim().length > 0;
  const shouldShowResults = isCategory || hasQuery || loading || Boolean(error);

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
        <DesktopSearchBox
          placeholder={isCategory ? `${activeMeta!.label}を検索` : 'ユーザー・単語帳を検索'}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          style={{ width: '100%', minWidth: 0 }}
        />
        <div style={{ justifySelf: 'end' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
            {(Object.keys(CATEGORY_META) as Array<Exclude<SharedDiscoverCategory, 'all'>>).map((key) => (
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
              />
            ) : hasQuery ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                <UserGrid users={payload.users} />
                <ProjectGrid projects={payload.projects} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function CategoryResults({
  category,
  payload,
  loadingMore,
  onLoadMore,
}: {
  category: Exclude<SharedDiscoverCategory, 'all'>;
  payload: SharedDiscoverPayload;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <>
      {category === 'users' && <UserGrid users={payload.users} />}
      {category === 'projects' && <ProjectGrid projects={payload.projects} />}
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

            return (
              <div
                key={user.userId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '42px minmax(0, 1fr)',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProjectGrid({ projects }: { projects: SharedProjectCard[] }) {
  return (
    <section>
      <SectionTitle count={projects.length}>単語帳</SectionTitle>
      {projects.length === 0 ? <EmptyCard label="該当する単語帳はありません" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {projects.map((project) => <DesktopSharedCard key={project.project.id} project={project} />)}
        </div>
      )}
    </section>
  );
}

function DesktopSharedCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerAccountId
      ? `@${project.ownerAccountId}`
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';

  return (
    <Link href={href} className="ds-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, color: 'inherit', textDecoration: 'none' }}>
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
