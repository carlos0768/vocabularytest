'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  DesktopButton,
  DesktopSearchBox,
  DesktopTopbar,
} from '@/components/desktop/DesktopChrome';
import { DesktopStudySidebar } from '@/components/desktop/DesktopStudySidebar';
import { ProjectFilterSheet, ProjectSortSheet } from '@/components/desktop/ProjectListSheets';
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
  onDeleteProject,
  onSetBinder,
  onCreateNew,
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
  onDeleteProject?: (project: DesktopProjectRow) => void;
  onSetBinder?: (project: DesktopProjectRow) => void;
  onCreateNew?: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'fav'>('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const rows = useMemo(() => {
    return filter === 'fav' ? projects.filter((project) => project.isFavorite) : projects;
  }, [filter, projects]);
  const totalWords = rows.reduce((sum, project) => sum + project.totalWords, 0);

  // バインダー (フォルダ) ごとにグループ化。バインダー名順 → 未分類の順
  const binderGroups = useMemo(() => {
    const byBinder = new Map<string, DesktopProjectRow[]>();
    const unfiled: DesktopProjectRow[] = [];
    for (const project of rows) {
      const name = project.binder?.trim();
      if (!name) {
        unfiled.push(project);
        continue;
      }
      const items = byBinder.get(name) ?? [];
      items.push(project);
      byBinder.set(name, items);
    }
    const groups: { binder: string | null; items: DesktopProjectRow[] }[] = Array.from(byBinder.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
      .map(([binder, items]) => ({ binder, items }));
    if (unfiled.length > 0) groups.push({ binder: null, items: unfiled });
    return groups;
  }, [rows]);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="単語帳" crumb="ライブラリ / 管理">
        <DesktopSearchBox
          placeholder="単語帳を検索"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <DesktopButton onClick={onCreateNew} variant="accent" icon="add">
          新規作成
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span className="mono muted tnum" style={{ fontSize: 12 }}>
              {rows.length} 冊 ・ 合計 {totalWords} 語
            </span>
            <div style={{ flex: 1 }} />
            {/* フィルタ・並べ替えは /project/* と同じ正方形アイコンボタンにシートを格納 */}
            <button
              type="button"
              className={'ds-btn sm' + (filter === 'fav' ? ' dark' : '')}
              style={{ width: 36, height: 36, padding: 0 }}
              onClick={() => setShowFilterSheet(true)}
              aria-pressed={filter === 'fav'}
              aria-label="フィルタ"
            >
              <Icon name="filter_list" />
            </button>
            <button
              type="button"
              className={'ds-btn sm' + (sort !== 'newest' ? ' dark' : '')}
              style={{ width: 36, height: 36, padding: 0 }}
              onClick={() => setShowSortSheet(true)}
              aria-pressed={sort !== 'newest'}
              aria-label="並べ替え"
            >
              <Icon name="swap_vert" />
            </button>
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
                {binderGroups.map((group) => (
                  group.binder !== null ? (
                    // バインダーは単体行で表示。中身はタップして /binder/[name] で見せる
                    <DesktopBinderTableRow key={group.binder} name={group.binder} count={group.items.length} />
                  ) : (
                    <Fragment key="__unfiled__">
                      {group.items.map((project) => (
                        <DesktopProjectTableRow key={project.id} project={project} onDelete={onDeleteProject} onSetBinder={onSetBinder} />
                      ))}
                    </Fragment>
                  )
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

      <ProjectFilterSheet
        open={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        filter={filter}
        onFilterChange={setFilter}
      />
      <ProjectSortSheet
        open={showSortSheet}
        onClose={() => setShowSortSheet(false)}
        sort={sort}
        onSortChange={onSortChange}
      />
    </div>
  );
}

// バインダー(フォルダ)を単体行として表示する。行タップで /binder/[name] に入り、
// 中の単語帳はそこで見せる（一覧では展開しない）。
function DesktopBinderTableRow({ name, count }: { name: string; count: number }) {
  return (
    <tr>
      <td className="star">
        <Icon name="folder" filled style={{ color: 'var(--color-muted)' }} />
      </td>
      <td>
        <Link href={`/binder/${encodeURIComponent(name)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <span
            className="ds-project-icon ds-project-icon--sm"
            style={{ background: desktopThumbColor(name), display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="folder" size={18} filled style={{ color: '#fff' }} />
          </span>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{name}</span>
        </Link>
      </td>
      <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>バインダー</td>
      <td className="tnum" style={{ fontWeight: 700 }}>{count}冊</td>
      <td />
      <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>—</td>
      <td>
        <Link href={`/binder/${encodeURIComponent(name)}`} aria-label="バインダーを開く" style={{ color: 'var(--color-muted)', lineHeight: 0 }}>
          <Icon name="chevron_right" />
        </Link>
      </td>
    </tr>
  );
}

function DesktopProjectTableRow({
  project,
  onDelete,
  onSetBinder,
}: {
  project: DesktopProjectRow;
  onDelete?: (project: DesktopProjectRow) => void;
  onSetBinder?: (project: DesktopProjectRow) => void;
}) {
  const pct = project.totalWords > 0 ? Math.round((project.masteredWords / project.totalWords) * 100) : 0;
  // メニューはテーブルの overflow:hidden で切れないよう fixed で描画し、
  // ボタン位置に合わせて配置する。
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const hasMenu = Boolean(onDelete || onSetBinder);

  return (
    <tr>
      <td className="star">
        <Icon name="bookmark" filled={project.isFavorite} style={project.isFavorite ? { color: 'var(--color-accent)' } : undefined} />
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
      <td>
        {hasMenu ? (
          <button
            type="button"
            aria-label="メニュー"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 6, right: Math.max(12, window.innerWidth - rect.right) });
            }}
            style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--color-muted)', lineHeight: 0 }}
          >
            <Icon name="more_horiz" />
          </button>
        ) : (
          <Icon name="more_horiz" style={{ color: 'var(--color-muted)' }} />
        )}
        {menuPos && (
          <>
            <button
              type="button"
              aria-label="閉じる"
              onClick={() => setMenuPos(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'transparent', border: 'none', cursor: 'default' }}
            />
            <div
              style={{
                position: 'fixed',
                top: menuPos.top,
                right: menuPos.right,
                zIndex: 61,
                width: 190,
                overflow: 'hidden',
                borderRadius: 12,
                border: '2px solid var(--solid-ink)',
                background: '#fff',
                boxShadow: '2px 3px 0 var(--solid-ink)',
              }}
            >
              {onSetBinder && (
                <button
                  type="button"
                  onClick={() => { setMenuPos(null); onSetBinder(project); }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-bold text-[var(--solid-ink)] hover:bg-[var(--color-surface-secondary)]"
                >
                  <Icon name="folder" size={16} />
                  バインダーに追加
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => { setMenuPos(null); onDelete(project); }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-bold hover:bg-[var(--color-surface-secondary)]"
                  style={{ color: 'var(--color-error)' }}
                >
                  <Icon name="delete" size={16} />
                  単語帳を削除
                </button>
              )}
            </div>
          </>
        )}
      </td>
    </tr>
  );
}
