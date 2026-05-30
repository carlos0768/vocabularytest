'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { DesktopSearchBox, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { desktopThumbColor } from '@/components/desktop/desktop-data';
import type { SharedProjectCard } from '@/lib/shared-projects/types';

export function DesktopSharedView({
  projects,
  nextCursor,
  loadingMore,
  error,
  onLoadMore,
}: {
  projects: SharedProjectCard[];
  nextCursor: string | null;
  loadingMore: boolean;
  error: string | null;
  onLoadMore: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'popular' | 'public'>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const popularCount = projects.filter((project) => (project.likeCount ?? 0) > 0).length;
  const rows = useMemo(() => {
    const base = filter === 'popular'
      ? [...projects].filter((project) => (project.likeCount ?? 0) > 0).sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      : projects;
    return base.filter((project) => !q || project.project.title.toLowerCase().includes(q));
  }, [filter, projects, q]);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="共有ライブラリ" crumb="コレクション / みんなの単語帳">
        <DesktopSearchBox
          placeholder="公開単語帳を検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </DesktopTopbar>
      <div className="ds-scroll">
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button type="button" className={'ds-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>すべて <span className="tnum" style={{ opacity: 0.7 }}>{projects.length}</span></button>
          <button type="button" className={'ds-chip' + (filter === 'popular' ? ' active' : '')} onClick={() => setFilter('popular')}>人気 <span className="tnum" style={{ opacity: 0.7 }}>{popularCount}</span></button>
          <button type="button" className={'ds-chip' + (filter === 'public' ? ' active' : '')} onClick={() => setFilter('public')}>公開中 <span className="tnum" style={{ opacity: 0.7 }}>{projects.length}</span></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {rows.map((project) => (
            <DesktopSharedCard key={project.project.id} project={project} />
          ))}
        </div>
        {rows.length === 0 && (
          <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)' }}>
            公開中の単語帳はまだありません
          </div>
        )}
        {error && (
          <div className="ds-card" style={{ marginTop: 16, padding: 14, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
            {error}
          </div>
        )}
        {nextCursor && (
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="ds-btn" style={{ marginTop: 18 }}>
            <Icon name={loadingMore ? 'progress_activity' : 'expand_more'} className={loadingMore ? 'animate-spin' : undefined} />
            {loadingMore ? '読み込み中...' : 'もっと見る'}
          </button>
        )}
      </div>
    </div>
  );
}

function DesktopSharedCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';
  const subject = project.accessRole === 'owner' ? '公開中' : project.accessRole === 'editor' ? '参加中' : '共有中';

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
        <span className="ds-tag plain">{subject}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>
          {project.wordCount ?? 0}<span style={{ fontSize: 12, color: 'var(--color-secondary-text)' }}> 語</span>
        </span>
        <span className="muted" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="thumb_up" style={{ fontSize: 15 }} />{project.likeCount ?? 0}
        </span>
      </div>
      <span className="ds-btn" style={{ width: '100%' }}><Icon name="add" />詳細を見る</span>
    </Link>
  );
}
