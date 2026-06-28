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

type DesktopHomeProject = Project & {
  totalWords: number;
  masteredWords: number;
  reviewWords: number;
  newWords: number;
  lastUsedAt?: string | null;
};

type DesktopHomeStats = {
  dueCount: number;
  completedToday: number;
  streakDays: number;
  totalWords: number;
  mastered: number;
  activeW: number;
  review: number;
  newW: number;
};

type DesktopPendingScan = {
  id: string;
  project_title: string;
  iconDataUrl?: string;
};

export function DesktopHomeView({
  projects,
  stats,
  loading,
  error,
  pendingScans,
  onStartScan,
}: {
  projects: DesktopHomeProject[];
  stats: DesktopHomeStats;
  loading: boolean;
  error: string | null;
  pendingScans: DesktopPendingScan[];
  onStartScan: () => void;
}) {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filteredProjects = useMemo(
    () => (q ? projects.filter((project) => project.title.toLowerCase().includes(q)) : projects),
    [projects, q],
  );
  const firstProject = projects[0];
  const hasVisibleBooks = pendingScans.length > 0 || filteredProjects.length > 0;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="マイ単語帳" crumb="HOME / ライブラリ">
        <DesktopSearchBox
          placeholder="単語・単語帳を検索"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <DesktopButton variant="accent" icon="add" onClick={onStartScan}>
          新規作成
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
        <div>
          {error && (
            <div className="ds-card" style={{ padding: 14, marginBottom: 18, color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          <div className="ds-sec-head" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2>本棚</h2>
              <span className="mono muted" style={{ fontSize: 12 }}>
                {projects.length + pendingScans.length} 冊 · {stats.totalWords} 語
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="ds-btn ghost sm"
                onClick={() => setView('grid')}
                style={view === 'grid' ? { background: 'rgba(26,26,26,0.06)' } : undefined}
                aria-label="グリッド表示"
              >
                <Icon name="grid_view" />
              </button>
              <button
                type="button"
                className="ds-btn ghost sm"
                onClick={() => setView('list')}
                style={view === 'list' ? { background: 'rgba(26,26,26,0.06)' } : undefined}
                aria-label="リスト表示"
              >
                <Icon name="view_list" />
              </button>
            </div>
          </div>

          {loading && projects.length === 0 ? (
            <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)' }}>
              <Icon name="progress_activity" className="animate-spin" />
              <span style={{ marginLeft: 8 }}>読み込み中...</span>
            </div>
          ) : !hasVisibleBooks ? (
            <button
              type="button"
              onClick={onStartScan}
              className="ds-book"
              style={{
                width: 220,
                background: '#fff',
                color: 'var(--color-muted)',
                border: '1.5px dashed var(--solid-ink)',
                boxShadow: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Icon name="add" style={{ fontSize: 30, color: 'var(--color-ink)' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--color-ink)' }}>
                新しい単語帳
              </div>
              <div className="mono" style={{ fontSize: 10, textAlign: 'center' }}>
                写真を撮るだけ
              </div>
            </button>
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
              {pendingScans.map((scan) => (
                <DesktopGeneratingBookTile key={scan.id} scan={scan} />
              ))}
              {filteredProjects.map((project) => (
                <DesktopBookTile key={project.id} project={project} />
              ))}
              <button
                type="button"
                onClick={onStartScan}
                className="ds-book"
                style={{
                  background: '#fff',
                  color: 'var(--color-muted)',
                  border: '1.5px dashed var(--solid-ink)',
                  boxShadow: 'none',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Icon name="add" style={{ fontSize: 30, color: 'var(--color-ink)' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--color-ink)' }}>
                  新しい単語帳
                </div>
                <div className="mono" style={{ fontSize: 10, textAlign: 'center' }}>
                  写真を撮るだけ
                </div>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingScans.map((scan) => (
                <DesktopGeneratingProjectRow key={scan.id} scan={scan} />
              ))}
              {filteredProjects.map((project) => (
                <DesktopProjectRow key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>

        <DesktopStudySidebar stats={stats} reviewHref={stats.totalWords > 0 ? '/quiz/all?review=1&from=/' : '/projects'} />
      </div>
    </div>
  );
}

function DesktopGeneratingBookTile({ scan }: { scan: DesktopPendingScan }) {
  return (
    <div
      className="ds-book"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${scan.project_title} を生成中`}
      style={{
        background: scan.iconDataUrl
          ? `linear-gradient(rgba(26,26,26,0.42), rgba(26,26,26,0.42)), center / cover url(${scan.iconDataUrl})`
          : 'linear-gradient(135deg, #137FEC 0%, #3DA1B8 52%, #228B22 100%)',
        cursor: 'default',
        pointerEvents: 'none',
      }}
    >
      <div className="bk-spine" />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="bk-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {scan.project_title}
          </div>
          <div className="bk-foot mono">単語を抽出中...</div>
        </div>
        <div
          className="scanvocab-generating-spin"
          style={{
            width: 30,
            height: 30,
            border: '3px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            borderRadius: 999,
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      </div>
      <div>
        <div className="bk-n">AI<span className="u">解析</span></div>
        <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          <span className="scanvocab-generating-pulse" style={{ height: 9, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.78)' }} />
          <span className="scanvocab-generating-pulse" style={{ height: 9, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.58)', animationDelay: '0.16s' }} />
          <span className="scanvocab-generating-pulse" style={{ height: 9, flex: 1, borderRadius: 999, background: 'rgba(255,255,255,0.38)', animationDelay: '0.32s' }} />
        </div>
      </div>
    </div>
  );
}

function DesktopBookTile({ project }: { project: DesktopHomeProject }) {
  const pct = project.totalWords > 0 ? Math.round((project.masteredWords / project.totalWords) * 100) : 0;
  const bg = project.iconImage ? undefined : desktopThumbColor(project.id);
  return (
    <Link
      href={`/project/${project.id}`}
      className="ds-book"
      style={{
        background: bg,
        backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="bk-spine" />
      <div>
        <div className="bk-title">{project.title}</div>
        <div className="bk-foot mono">{desktopSourceLabel(project)}</div>
      </div>
      <div>
        <div className="bk-n">{project.totalWords}<span className="u">語</span></div>
        <div className="bk-bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="bk-foot">習得 {pct}% · 更新 {desktopUpdatedLabel(project.lastUsedAt ?? project.createdAt)}</div>
      </div>
    </Link>
  );
}

function DesktopGeneratingProjectRow({ scan }: { scan: DesktopPendingScan }) {
  return (
    <div className="ds-prow" role="status" aria-live="polite" aria-busy="true" style={{ cursor: 'default', pointerEvents: 'none' }}>
      <div
        className="tn"
        style={{
          background: scan.iconDataUrl
            ? `center / cover url(${scan.iconDataUrl})`
            : 'linear-gradient(135deg, #137FEC, #3DA1B8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          className="scanvocab-generating-spin"
          style={{
            width: 25,
            height: 25,
            border: '3px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            borderRadius: 999,
          }}
          aria-hidden="true"
        />
      </div>
      <div className="body">
        <div className="ttl">{scan.project_title}</div>
        <div className="sub">AI が単語を抽出しています</div>
      </div>
      <div className="count" style={{ fontSize: 18 }}>生成中</div>
    </div>
  );
}

function DesktopProjectRow({ project }: { project: DesktopHomeProject }) {
  const hasWords = project.totalWords > 0;
  return (
    <div className="ds-prow">
      <Link href={`/project/${project.id}`} className="ds-prow-main">
        <div
          className="tn"
          style={{
            background: desktopThumbColor(project.id),
            backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!project.iconImage && project.title.charAt(0)}
        </div>
        <div className="body">
          <div className="ttl">{project.title}</div>
          <div className="sub">{desktopSourceLabel(project)} · 更新 {desktopUpdatedLabel(project.lastUsedAt ?? project.createdAt)}</div>
        </div>
        <div className="count">{project.totalWords}<span className="u">語</span></div>
      </Link>
      {hasWords && (
        <Link
          href={`/quiz/${project.id}?from=/`}
          className="ds-prow-play"
          aria-label={`${project.title}のクイズを開始`}
          title="クイズを開始"
        >
          <Icon name="play_arrow" size={20} filled />
        </Link>
      )}
      <Icon name="chevron_right" style={{ color: 'var(--color-muted)' }} />
    </div>
  );
}
