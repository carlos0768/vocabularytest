'use client';

import { startTransition, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { DesktopSharedView } from '@/components/desktop/DesktopShared';
import { Icon } from '@/components/ui';
import type {
  SharedProjectCard,
  SharedProjectMetricsMap,
} from '@/lib/shared-projects/types';
import {
  collectMetricProjectIds,
  mergeMetricsIntoCards,
  mergeUniqueProjectCards,
} from './shared-page-utils';

type SharedPageClientProps = {
  initialPublicItems: SharedProjectCard[];
  initialPublicNextCursor: string | null;
};

type PublicProjectsResponse = {
  items?: SharedProjectCard[];
  nextCursor?: string | null;
};

type MetricsResponse = {
  metrics?: SharedProjectMetricsMap;
};

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

type FilterKey = 'all' | 'popular' | 'public';

export default function SharedPageClient({
  initialPublicItems,
  initialPublicNextCursor,
}: SharedPageClientProps) {
  const [publicProjects, setPublicProjects] = useState<SharedProjectCard[]>(initialPublicItems);
  const [publicNextCursor, setPublicNextCursor] = useState<string | null>(initialPublicNextCursor);
  const [loadingMorePublic, setLoadingMorePublic] = useState(false);
  const [publicSectionError, setPublicSectionError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const pendingMetricIdsRef = useRef(new Set<string>());

  const applyMetrics = useEffectEvent((metrics: SharedProjectMetricsMap) => {
    startTransition(() => {
      setPublicProjects((current) => mergeMetricsIntoCards(current, metrics));
    });
  });

  const requestMetrics = useEffectEvent(async (projectIds: string[]) => {
    const nextIds = projectIds.filter((projectId) => !pendingMetricIdsRef.current.has(projectId));
    if (nextIds.length === 0) return;

    for (const projectId of nextIds) pendingMetricIdsRef.current.add(projectId);

    try {
      const response = await fetch(`/api/shared-projects/metrics?projectIds=${encodeURIComponent(nextIds.join(','))}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;

      const payload = await response.json() as MetricsResponse;
      if (payload.metrics) applyMetrics(payload.metrics);
    } catch {
      // Keep placeholders when metrics fail.
    } finally {
      for (const projectId of nextIds) pendingMetricIdsRef.current.delete(projectId);
    }
  });

  useEffect(() => {
    const projectIds = collectMetricProjectIds([], [], publicProjects);
    if (projectIds.length > 0) requestMetrics(projectIds);
  }, [publicProjects]);

  async function handleLoadMorePublic() {
    if (!publicNextCursor || loadingMorePublic) return;

    setLoadingMorePublic(true);
    setPublicSectionError(null);

    try {
      const response = await fetch(
        `/api/shared-projects/public?limit=8&cursor=${encodeURIComponent(publicNextCursor)}`,
        { cache: 'no-store' },
      );

      if (!response.ok) throw new Error('shared_public_fetch_failed');

      const payload = await response.json() as PublicProjectsResponse;
      startTransition(() => {
        setPublicProjects((current) => mergeUniqueProjectCards(current, payload.items ?? []));
        setPublicNextCursor(payload.nextCursor ?? null);
      });
    } catch (error) {
      console.error('Failed to load more public projects:', error);
      setPublicSectionError('公開単語帳を追加で読み込めませんでした。');
    } finally {
      setLoadingMorePublic(false);
    }
  }

  const popularCount = publicProjects.filter((project) => (project.likeCount ?? 0) > 0).length;

  const filteredPublicProjects = activeFilter === 'popular'
    ? [...publicProjects].filter((p) => (p.likeCount ?? 0) > 0).sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    : publicProjects;

  return (
    <>
      <DesktopSharedView
        publicProjects={publicProjects}
        publicNextCursor={publicNextCursor}
        publicLoadingMore={loadingMorePublic}
        publicError={publicSectionError}
        onLoadMorePublic={() => void handleLoadMorePublic()}
      />
      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-2 pt-1">
        <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          COMMUNITY
        </div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">
          共有単語帳
        </div>
        <div className="mt-1 text-xs leading-[1.5] text-[var(--color-muted)]">
          みんなの公開単語帳を閲覧できます。
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-[14px] py-3">
        <FilterChip label="すべて" count={publicProjects.length} active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} />
        <FilterChip label="人気" count={popularCount} active={activeFilter === 'popular'} onClick={() => setActiveFilter('popular')} />
        <FilterChip label="公開中" count={publicProjects.length} active={activeFilter === 'public'} onClick={() => setActiveFilter('public')} />
      </div>

      <div className="flex flex-col gap-2 px-[14px]">
        {filteredPublicProjects.length === 0 ? (
          <div className="relative">
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
            <div className="relative rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-4 py-12 text-center text-sm font-bold text-[var(--color-muted)]">
              公開中の単語帳はまだありません
            </div>
          </div>
        ) : (
          filteredPublicProjects.map((project) => (
            <ProjectCard key={project.project.id} project={project} />
          ))
        )}

        {publicSectionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {publicSectionError}
          </div>
        )}

        {publicNextCursor && (
          <button
            type="button"
            onClick={handleLoadMorePublic}
            disabled={loadingMorePublic}
            className="relative mt-2 disabled:opacity-60"
          >
            <span className="absolute inset-0 translate-x-[2px] translate-y-[2px] rounded-xl bg-[var(--solid-ink)]" />
            <span className="relative flex items-center justify-center gap-2 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-4 py-3 text-sm font-bold text-[var(--solid-ink)]">
              {loadingMorePublic ? (
                <>
                  <Icon name="progress_activity" size={18} className="animate-spin" />
                  読み込み中...
                </>
              ) : (
                <>
                  <Icon name="expand_more" size={18} />
                  もっと見る
                </>
              )}
            </span>
          </button>
        )}
      </div>
      </div>
    </>
  );
}

function FilterChip({ label, count, active = false, onClick }: { label: string; count: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-[11px] py-1.5 text-[11px] font-bold transition-colors"
      style={{
        background: active ? 'var(--solid-ink)' : '#fff',
        color: active ? '#fff' : 'var(--solid-ink)',
        border: `1.25px solid ${active ? 'var(--solid-ink)' : 'var(--color-border)'}`,
      }}
    >
      {label}
      <span className="font-mono text-[9px] font-bold tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function ProjectCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const bg = thumbColor(project.project.id);
  const badgeLabel = project.accessRole === 'owner'
    ? '公開中'
    : project.accessRole === 'editor'
      ? '参加中'
      : '共有中';
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';

  return (
    <Link href={href} className="relative block">
      <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
      <div className="relative flex items-center gap-[11px] rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white p-3 transition-all duration-100 active:translate-x-px active:translate-y-px">
        <div
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[10px] border-[1.25px] bg-cover bg-center font-display text-[22px] font-extrabold text-white"
          style={{
            backgroundColor: bg,
            backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
            borderColor: 'var(--solid-ink)',
          }}
        >
          {!project.project.iconImage && project.project.title.charAt(0)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-display text-[14px] font-bold text-[var(--solid-ink)]">
              {project.project.title}
            </span>
          </div>
          <div className="mt-[3px] flex items-center gap-1.5">
            <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-[rgba(26,26,26,0.06)] font-mono text-[8px] font-bold text-[var(--color-muted)]">
              {ownerLabel.charAt(0).replace('@', '')}
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--color-muted)]">
              {ownerLabel}
            </span>
            <span className="text-[11px] text-[var(--color-muted)] opacity-50">.</span>
            <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
              {project.wordCount === undefined ? '読込中' : `${project.wordCount} 語`}
            </span>
            {(project.likeCount ?? 0) > 0 && (
              <>
                <span className="text-[11px] text-[var(--color-muted)] opacity-50">.</span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
                  {project.likeCount} likes
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="shrink-0 rounded px-[7px] py-[3px] font-mono text-[9px] font-bold tracking-[0.04em]"
          style={{ background: project.accessRole === 'owner' ? 'var(--solid-ink)' : '#fff', color: project.accessRole === 'owner' ? '#fff' : 'var(--solid-ink)', border: '1px solid var(--solid-ink)' }}
        >
          {badgeLabel}
        </div>
      </div>
    </Link>
  );
}
