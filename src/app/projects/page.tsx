'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SolidEmpty, SolidPanel } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import {
  buildProjectStats,
  getWordsByProjectMap,
  type ProjectWithStats,
  type WordReadRepository,
} from '@/lib/projects/load-helpers';
import { getGuestUserId } from '@/lib/utils';
import type { Project, SubscriptionStatus } from '@/types';

const SORTS = [
  { k: 'newest',   label: '新しい順',     icon: 'schedule' },
  { k: 'words',    label: '単語が多い順', icon: 'sort' },
  { k: 'lastUsed', label: '最近使った順', icon: 'history' },
] as const;

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

type SortKey = (typeof SORTS)[number]['k'];
type ProjectRowStats = ProjectWithStats & {
  reviewWords: number;
  newWords: number;
};

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

async function addStatsToProjects(
  projects: Project[],
  repo: WordReadRepository,
): Promise<ProjectRowStats[]> {
  const wordsByProject = await getWordsByProjectMap(
    repo,
    projects.map((project) => project.id),
  );
  return buildProjectStats(projects, wordsByProject).map((project) => {
    const words = wordsByProject[project.id] ?? [];
    return {
      ...project,
      reviewWords: words.filter((word) => word.status === 'review').length,
      newWords: words.filter((word) => word.status === 'new').length,
    };
  });
}

export default function ProjectListPage() {
  const { user, subscription, loading: authLoading, isPro } = useAuth();
  const [projects, setProjects] = useState<ProjectRowStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [error, setError] = useState<string | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const showProjects = useCallback(async (rawProjects: Project[], repo: WordReadRepository) => {
    setProjects(await addStatsToProjects(rawProjects, repo));
  }, []);

  const loadProjects = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    try {
      const userId = user ? user.id : getGuestUserId();
      let rawProjects: Project[] = [];
      let repo: WordReadRepository = repository;

      try {
        rawProjects = await localRepository.getProjects(userId);
        if (rawProjects.length > 0) {
          await showProjects(rawProjects, localRepository);
          setLoading(false);
        }
      } catch (localError) {
        console.error('Local projects preload failed:', localError);
      }

      if (user && navigator.onLine) {
        try {
          const remoteProjects = await remoteRepository.getProjects(user.id);
          if (remoteProjects.length > 0 || isPro || rawProjects.length === 0) {
            rawProjects = remoteProjects;
            repo = remoteRepository;
          }
        } catch (remoteError) {
          console.error('Remote projects load failed:', remoteError);
        }
      }

      if (rawProjects.length === 0) {
        rawProjects = await repository.getProjects(userId);
        repo = repository;
      }

      await showProjects(rawProjects, repo);
    } catch (loadError) {
      console.error('Failed to load projects:', loadError);
      setError('単語帳の読み込みに失敗しました');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isPro, repository, showProjects, user]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = normalizedQuery
      ? projects.filter((project) => project.title.toLowerCase().includes(normalizedQuery))
      : projects;

    return [...base].sort((a, b) => {
      if (sort === 'words') return b.totalWords - a.totalWords;
      if (sort === 'lastUsed') {
        const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return bTime - aTime;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [projects, query, sort]);

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[150px] pt-3 font-[var(--font-body)] lg:pt-[54px]">
      <div className="px-5 pb-3.5 pt-2.5">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted)]">
          MY BOOKS
        </div>
        <h1 className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">
          マイ単語帳
        </h1>
      </div>

      <div className="px-[18px] pb-2.5 pt-1">
        <SolidPanel className="!rounded-xl !shadow-[2px_2px_0_var(--solid-ink)]" faceClassName="!px-3.5 !py-2.5">
          <label className="flex items-center gap-2 text-[var(--color-muted)]">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="マイ単語帳を検索"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
            />
          </label>
        </SolidPanel>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-[18px] pb-3.5 pt-1">
        {SORTS.map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setSort(s.k)}
            className={`inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              sort === s.k
                ? 'border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white'
                : 'border-[1.25px] border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]'
            }`}
          >
            <Icon name={s.icon} size={12} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-baseline justify-between px-5 pb-2 pt-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-muted)]">すべて</span>
        <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{filtered.length} 件</span>
      </div>

      {error && (
        <div className="px-[18px] pb-3 text-xs font-bold text-[var(--color-error)]">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-[18px] pb-[150px]">
        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">読み込み中...</span>
          </div>
        ) : filtered.length === 0 ? (
          <SolidEmpty
            icon="menu_book"
            title={query ? '一致する単語帳がありません' : '単語帳はまだありません'}
            description={query ? '検索語を変えてもう一度探してください。' : 'スキャンして最初の単語帳を作成しましょう。'}
            action={
              <Link href="/scan" className="solid-link-primary">
                <Icon name="add_a_photo" size={16} />
                新規スキャン
              </Link>
            }
          />
        ) : (
          filtered.map((project) => <BookRow key={project.id} project={project} />)
        )}
      </div>

      <Link href="/scan" className="absolute bottom-[108px] right-[22px] z-30">
        <span className="relative block">
          <span className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-full bg-[var(--solid-ink)]" />
          <span className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] bg-[var(--color-accent)] text-white">
            <Icon name="add" size={22} />
          </span>
        </span>
      </Link>
    </div>
  );
}

function BookRow({ project }: { project: ProjectRowStats }) {
  const bg = thumbColor(project.id);
  return (
    <Link href={`/project/${project.id}`}>
      <SolidPanel
        className="!rounded-[14px] !shadow-[2.5px_2.5px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:!shadow-[1px_1px_0_var(--solid-ink)]"
        faceClassName="!p-[13px]"
      >
        <div className="flex items-center gap-[13px]">
          <div
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-center bg-cover font-display text-[18px] font-extrabold text-white"
            style={{ backgroundColor: bg, backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
          >
            {!project.iconImage && project.title.charAt(0)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-[var(--solid-ink)]">{project.title}</div>
            <div className="mt-1 flex gap-2.5">
              <DotChip color="var(--color-success)" label={`習得 ${project.masteredWords}`} />
              <DotChip color="var(--color-warning)" label={`学習 ${project.reviewWords}`} />
              <DotChip color="rgba(26,26,26,0.2)" label={`未 ${project.newWords}`} />
            </div>
          </div>

          <span className="mr-0.5 inline-flex text-[var(--color-muted)]">
            <Icon name="chevron_right" size={14} />
          </span>
        </div>
      </SolidPanel>
    </Link>
  );
}

function DotChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-[var(--color-muted)]">{label}</span>
    </span>
  );
}
