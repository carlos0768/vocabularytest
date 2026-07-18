'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  DesktopButton,
  DesktopSearchBox,
  DesktopTopbar,
} from '@/components/desktop/DesktopChrome';
import { DesktopStudySidebar } from '@/components/desktop/DesktopStudySidebar';
import {
  desktopSourceLabel,
  desktopThumbColor,
  desktopUpdatedLabel,
} from '@/components/desktop/desktop-data';
import type { Project } from '@/types';
import type { DesktopStudySummaryStats } from '@/lib/desktop-study-summary';

type DesktopProjectRow = Project & {
  totalWords: number;
  masteredWords: number;
  reviewWords: number;
  newWords: number;
  lastUsedAt?: string | null;
};

export function DesktopProjectsView({
  projects,
  loading,
  error,
  query,
  sort,
  summaryStats,
  reviewHref,
  learnHref,
  onQueryChange,
  onSortChange,
}: {
  projects: DesktopProjectRow[];
  loading: boolean;
  error: string | null;
  query: string;
  sort: 'newest' | 'words' | 'lastUsed';
  summaryStats: DesktopStudySummaryStats;
  reviewHref: string;
  learnHref?: string;
  onQueryChange: (value: string) => void;
  onSortChange: (value: 'newest' | 'words' | 'lastUsed') => void;
}) {
  const [filter, setFilter] = useState<'all' | 'fav'>('all');
  const rows = useMemo(() => {
    return filter === 'fav' ? projects.filter((project) => project.isFavorite) : projects;
  }, [filter, projects]);
  const totalWords = rows.reduce((sum, project) => sum + project.totalWords, 0);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="単語帳" crumb="ライブラリ / 管理">
        <DesktopSearchBox
          placeholder="単語帳を検索"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <DesktopButton href="/scan" variant="accent" icon="add">
          新規作成
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button type="button" className={'ds-chip' + (filter === 'all' ? ' active' : '')} onClick={() => setFilter('all')}>
              すべて <span className="tnum" style={{ opacity: 0.7 }}>{projects.length}</span>
            </button>
            <button type="button" className={'ds-chip' + (filter === 'fav' ? ' active' : '')} onClick={() => setFilter('fav')}>
              <Icon name="star" filled style={{ fontSize: 15 }} />保存
            </button>
            <button type="button" className={'ds-chip' + (sort === 'newest' ? ' active' : '')} onClick={() => onSortChange('newest')}>
              <Icon name="schedule" style={{ fontSize: 15 }} />新しい順
            </button>
            <button type="button" className={'ds-chip' + (sort === 'words' ? ' active' : '')} onClick={() => onSortChange('words')}>
              <Icon name="sort" style={{ fontSize: 15 }} />単語が多い順
            </button>
            <button type="button" className={'ds-chip' + (sort === 'lastUsed' ? ' active' : '')} onClick={() => onSortChange('lastUsed')}>
              <Icon name="history" style={{ fontSize: 15 }} />最近使った順
            </button>
            <div style={{ flex: 1 }} />
            <span className="mono muted" style={{ fontSize: 12 }}>合計 {totalWords} 語</span>
          </div>

          {error && (
            <div className="ds-card" style={{ padding: 14, marginBottom: 16, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th style={{ width: 42 }} />
                  <th>単語帳</th>
                  <th style={{ width: 150 }}>出典</th>
                  <th style={{ width: 80 }}>語数</th>
                  <th style={{ width: 200 }}>習得率</th>
                  <th style={{ width: 90 }}>更新</th>
                  <th style={{ width: 50 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((project) => (
                  <DesktopProjectTableRow key={project.id} project={project} />
                ))}
              </tbody>
            </table>
            {loading && projects.length === 0 && (
              <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
                <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
                読み込み中...
              </div>
            )}
            {!loading && rows.length === 0 && (
              <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
                {query ? '一致する単語帳がありません' : '単語帳はまだありません'}
              </div>
            )}
          </div>
        </div>

        <DesktopStudySidebar stats={summaryStats} reviewHref={reviewHref} learnHref={learnHref} />
            </div>
    </div>
  );
}

function DesktopProjectTableRow({ project }: { project: DesktopProjectRow }) {
  const pct = project.totalWords > 0 ? Math.round((project.masteredWords / project.totalWords) * 100) : 0;

  return (
    <tr>
      <td className="star">
        <Icon name={project.isFavorite ? 'star' : 'star_border'} filled={project.isFavorite} style={project.isFavorite ? { color: 'var(--color-warning)' } : undefined} />
      </td>
      <td>
        <Link href={`/project/${project.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <span
            className="ds-project-icon ds-project-icon--sm"
            style={{
              background: desktopThumbColor(project.id),
              backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            }}
          >
            {!project.iconImage && project.title.charAt(0)}
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{project.title}</span>
        </Link>
      </td>
      <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{desktopSourceLabel(project)}</td>
      <td className="tnum" style={{ fontWeight: 700 }}>{project.totalWords}</td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div className="ds-prog" style={{ flex: 1 }}>
            <div className="fi" style={{ width: `${pct}%` }} />
          </div>
          <span className="mono tnum" style={{ fontSize: 11, fontWeight: 700, width: 30 }}>{pct}%</span>
        </div>
      </td>
      <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>{desktopUpdatedLabel(project.lastUsedAt ?? project.createdAt)}</td>
      <td><Icon name="more_horiz" style={{ color: 'var(--color-muted)', cursor: 'pointer' }} /></td>
    </tr>
  );
}
