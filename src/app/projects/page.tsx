'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DesktopProjectsView } from '@/components/desktop/DesktopProjects';
import { BinderPickerSheet } from '@/components/desktop/ProjectListSheets';
import { Icon } from '@/components/ui/Icon';
import { SolidEmpty, SolidPanel } from '@/components/redesign/SolidPage';
import { CreateWordbookSheet } from '@/components/home/CreateWordbookSheet';
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
import {
  buildDesktopStudySummaryStats,
  EMPTY_DESKTOP_STUDY_SUMMARY,
  type DesktopStudySummaryStats,
} from '@/lib/desktop-study-summary';
import { summarizeWordMemory } from '@/lib/words/memory';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import { getGuestUserId } from '@/lib/utils';
import {
  invalidateHomeCache,
  markRemoteWordbooksRefreshed,
  shouldRefreshRemoteWordbooks,
} from '@/lib/home-cache';
import type { Project, SubscriptionStatus } from '@/types';
import { thumbColor } from '@/lib/ui/thumb-color';
import { MergeProjectModal } from '@/components/project/page/ProjectPageModals';
import { listMergeTargetProjects } from '@/lib/project/merge-projects';
import { mergeProjectWithLocalCache } from '@/lib/project/merge-projects-client';
import { useToast } from '@/components/ui/toast';

const SORTS = [
  { k: 'newest',   label: '新しい順',     icon: 'schedule' },
  { k: 'words',    label: '単語が多い順', icon: 'sort' },
  { k: 'lastUsed', label: '最近使った順', icon: 'history' },
] as const;

type SortKey = (typeof SORTS)[number]['k'];
type ProjectRowStats = ProjectWithStats & {
  reviewWords: number;
  newWords: number;
};

async function addStatsToProjects(
  projects: Project[],
  repo: WordReadRepository,
): Promise<{ projects: ProjectRowStats[]; summaryStats: DesktopStudySummaryStats }> {
  const wordsByProject = await getWordsByProjectMap(
    repo,
    projects.map((project) => project.id),
  );
  const rows = buildProjectStats(projects, wordsByProject).map((project) => {
    const words = wordsByProject[project.id] ?? [];
    const memorySummary = summarizeWordMemory(words);
    return {
      ...project,
      reviewWords: memorySummary.learning,
      newWords: memorySummary.unlearned,
    };
  });

  return {
    projects: rows,
    summaryStats: buildDesktopStudySummaryStats(Object.values(wordsByProject).flat()),
  };
}

export default function ProjectListPage() {
  const { user, subscription, loading: authLoading, isPro } = useAuth();
  const [projects, setProjects] = useState<ProjectRowStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [error, setError] = useState<string | null>(null);
  const [summaryStats, setSummaryStats] = useState<DesktopStudySummaryStats>(EMPTY_DESKTOP_STUDY_SUMMARY);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [desktopCreateOpen, setDesktopCreateOpen] = useState(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const showProjects = useCallback(async (rawProjects: Project[], repo: WordReadRepository) => {
    // Hide the internal reel-saved backing wordbook — its words live in 保存済み,
    // not in the browsable マイ単語帳 list.
    const result = await addStatsToProjects(excludeReelSavedProjects(rawProjects), repo);
    setProjects(result.projects);
    setSummaryStats(result.summaryStats);
  }, []);

  const loadProjects = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    try {
      const userId = user ? user.id : getGuestUserId();
      let rawProjects: Project[] = [];
      let repo: WordReadRepository = repository;
      let localPainted = false;

      try {
        rawProjects = await localRepository.getProjects(userId);
        if (rawProjects.length > 0) {
          await showProjects(rawProjects, localRepository);
          setLoading(false);
          localPainted = true;
        }
      } catch (localError) {
        console.error('Local projects preload failed:', localError);
      }

      // ローカルを描画できていて、直近に Supabase から取り直したばかりなら
      // 全単語の再ダウンロードはしない（ホームと同じ間引き。home-cache.ts 参照）。
      const needsRemote =
        Boolean(user) && navigator.onLine && (!localPainted || shouldRefreshRemoteWordbooks(userId));
      if (localPainted && !needsRemote) {
        return;
      }

      if (user && needsRemote) {
        try {
          const remoteProjects = await remoteRepository.getProjects(user.id);
          markRemoteWordbooksRefreshed(userId);
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
      setSummaryStats(EMPTY_DESKTOP_STUDY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isPro, repository, showProjects, user]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // 「...」メニュー: 削除 / バインダー追加。書き込みは同じ repository を使う。
  const handleDeleteProject = useCallback(async (project: Project) => {
    if (!window.confirm(`「${project.title}」を削除しますか？この操作は取り消せません。`)) return;
    try {
      await repository.deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      invalidateHomeCache();
    } catch {
      window.alert('削除に失敗しました');
    }
  }, [repository]);

  // 「他の単語帳に統合」: 単語帳ページのメニューと同じモーダル・同じ処理
  const { showToast } = useToast();
  const [mergeSource, setMergeSource] = useState<(Project & { totalWords: number }) | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const handleConfirmMerge = useCallback(async (targetProjectId: string) => {
    const source = mergeSource;
    const target = projects.find((p) => p.id === targetProjectId);
    if (!source || !target || mergeLoading) return;
    if (!user || !navigator.onLine) {
      showToast({ message: 'オンラインのときに統合してください', type: 'error' });
      return;
    }
    setMergeLoading(true);
    try {
      const moved = await mergeProjectWithLocalCache(source, target);
      showToast({ message: `${moved}語を「${target.title}」に統合しました`, type: 'success' });
      setMergeSource(null);
      // 統合先の語数・進み具合も変わるので一覧ごと読み直す (統合はキャッシュにも当て済み)
      void loadProjects();
    } catch (mergeError) {
      console.error('Failed to merge project:', mergeError);
      showToast({ message: '統合に失敗しました', type: 'error' });
    } finally {
      setMergeLoading(false);
    }
  }, [loadProjects, mergeLoading, mergeSource, projects, showToast, user]);

  // 「バインダーに追加」は window.prompt ではなくピッカーシートで選ばせる
  const [binderTarget, setBinderTarget] = useState<Project | null>(null);
  const handleSetBinder = useCallback((project: Project) => {
    setBinderTarget(project);
  }, []);

  const applyBinder = useCallback(async (binder: string | null) => {
    const target = binderTarget;
    setBinderTarget(null);
    if (!target) return;
    const next = binder?.trim().slice(0, 40) || null;
    try {
      await repository.updateProject(target.id, { binder: next });
      setProjects((prev) => prev.map((p) => (p.id === target.id ? { ...p, binder: next } : p)));
      invalidateHomeCache();
    } catch {
      window.alert('バインダーの更新に失敗しました');
    }
  }, [binderTarget, repository]);

  // 既存のバインダー名一覧 (重複排除・日本語順)
  const existingBinders = useMemo(() => {
    const set = new Set<string>();
    for (const project of projects) {
      const name = project.binder?.trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [projects]);

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
    <>
      <DesktopProjectsView
        projects={filtered}
        loading={loading}
        error={error}
        query={query}
        sort={sort}
        summaryStats={summaryStats}
        reviewHref={summaryStats.totalWords > 0 ? '/quiz/all?review=1&from=/projects' : '/projects'}
        learnHref={summaryStats.totalWords > 0 ? '/quiz/all?learn=1&from=/projects' : '/projects'}
        onQueryChange={setQuery}
        onSortChange={setSort}
        onDeleteProject={(project) => void handleDeleteProject(project)}
        onMergeProject={(project) => setMergeSource(project)}
        onSetBinder={handleSetBinder}
        onCreateNew={() => setDesktopCreateOpen(true)}
      />
      <BinderPickerSheet
        key={binderTarget?.id ?? 'closed'}
        open={binderTarget !== null}
        onClose={() => setBinderTarget(null)}
        project={binderTarget}
        binders={existingBinders}
        onApply={(binder) => void applyBinder(binder)}
      />
      <MergeProjectModal
        key={mergeSource?.id ?? 'closed'}
        open={mergeSource !== null}
        loading={mergeLoading}
        sourceTitle={mergeSource?.title ?? ''}
        wordCount={mergeSource?.totalWords ?? 0}
        projects={mergeSource ? listMergeTargetProjects(projects, mergeSource) : []}
        onCancel={() => { if (!mergeLoading) setMergeSource(null); }}
        onConfirm={(targetProjectId) => void handleConfirmMerge(targetProjectId)}
      />
      <div className="relative min-h-screen bg-[var(--color-background)] pb-[150px] pt-3 font-[var(--font-body)] desktop:hidden">
      <div className="px-5 pb-3.5 pt-2.5">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted)]">
          MY BOOKS
        </div>
        <h1 className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">
          マイ単語帳
        </h1>
      </div>

      <div className="px-[18px] pb-2.5 pt-1">
        <label className="flex items-center gap-2 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-[var(--color-muted)]">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="マイ単語帳を検索"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
          />
        </label>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-[18px] pb-3.5 pt-1">
        {SORTS.map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setSort(s.k)}
            className={`inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              sort === s.k
                ? 'border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
                : 'border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]'
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
              <button type="button" onClick={() => setCreateSheetOpen(true)} className="solid-link-primary">
                <Icon name="add" size={16} />
                単語帳を作成
              </button>
            }
          />
        ) : (
          <>
            {/* マイ単語帳ではバインダーを出さず、バインダー内の単語帳も含めて並べる */}
            {filtered.map((project) => (
              <BookRow
                key={project.id}
                project={project}
                onSetBinder={handleSetBinder}
                onMerge={setMergeSource}
                onDelete={(p) => void handleDeleteProject(p)}
              />
            ))}
          </>
        )}
      </div>

      </div>
      <CreateWordbookSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
      />
      {/* デスクトップの新規作成: ホームと同じく中央モーダルで作成方法を選ばせる（/scan直行にしない） */}
      <CreateWordbookSheet
        isOpen={desktopCreateOpen}
        onClose={() => setDesktopCreateOpen(false)}
      />
    </>
  );
}

function BookRow({
  project,
  onSetBinder,
  onMerge,
  onDelete,
}: {
  project: ProjectRowStats;
  /** 「...」メニューの「他の単語帳に統合」 */
  onMerge?: (project: ProjectRowStats) => void;
  /** 「...」メニューの「バインダーに追加」。デスクトップと同じピッカーを開く */
  onSetBinder?: (project: Project) => void;
  /** 「...」メニューの「削除」 */
  onDelete?: (project: Project) => void;
}) {
  const bg = thumbColor(project.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasMenu = Boolean(onSetBinder || onMerge || onDelete);

  return (
    // 「...」ボタンは <a> の中に <button> を入れないよう Link の兄弟として置く
    <div className="relative">
      <Link href={`/project/${project.id}`}>
        <SolidPanel
          className="!rounded-[14px] ! transition-all duration-100 active:translate-x-px active:translate-y-px active:!"
          faceClassName="!p-[13px]"
        >
          <div className="flex items-center gap-[13px]">
            <div
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-center bg-cover font-display text-[18px] font-extrabold text-white"
              style={{ backgroundColor: bg, backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
            >
              {!project.iconImage && project.title.charAt(0)}
            </div>

            <div className={`min-w-0 flex-1 ${hasMenu ? 'pr-[38px]' : ''}`}>
              <div className="truncate text-sm font-bold text-[var(--solid-ink)]">{project.title}</div>
              <div className="mt-0.5 text-[10px] tabular-nums text-[var(--color-muted)]">
                {project.totalWords}語
              </div>
              {project.totalWords > 0 && (
                <div className="mt-1.5 flex h-[4px] overflow-hidden rounded-full bg-[color-mix(in_srgb,_var(--solid-ink)_8%,_transparent)]">
                  {project.masteredWords > 0 && <div style={{ flex: project.masteredWords, background: 'var(--color-success)' }} />}
                  {project.activeWords > 0 && <div style={{ flex: project.activeWords, background: '#2563eb' }} />}
                  {project.reviewWords > 0 && <div style={{ flex: project.reviewWords, background: 'var(--color-warning)' }} />}
                  {project.newWords > 0 && <div style={{ flex: project.newWords, background: 'color-mix(in srgb, var(--solid-ink) 12%, transparent)' }} />}
                </div>
              )}
            </div>

            {!hasMenu && (
              <span className="mr-0.5 inline-flex text-[var(--color-muted)]">
                <Icon name="chevron_right" size={14} />
              </span>
            )}
          </div>
        </SolidPanel>
      </Link>
      {hasMenu && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setMenuOpen(true); }}
          aria-label={`「${project.title}」のメニュー`}
          className="absolute right-[11px] top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-opacity duration-100 active:opacity-60"
        >
          <Icon name="more_horiz" size={17} />
        </button>
      )}
      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] cursor-default bg-transparent"
            aria-label="メニューを閉じる"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-[11px] top-[52px] z-[71] w-[178px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-shadow)]">
            {onSetBinder && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onSetBinder(project); }}
                className="flex w-full items-center gap-2 border-b border-[var(--color-border-light)] px-3.5 py-3 text-left text-[13px] font-bold text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
              >
                <Icon name="folder" size={15} />
                バインダーに追加
              </button>
            )}
            {onMerge && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onMerge(project); }}
                className="flex w-full items-center gap-2 border-b border-[var(--color-border-light)] px-3.5 py-3 text-left text-[13px] font-bold text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
              >
                <Icon name="merge" size={15} />
                他の単語帳に統合
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDelete(project); }}
                className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[13px] font-bold active:bg-[var(--color-surface-secondary)]"
                style={{ color: 'var(--color-error, #cc4d59)' }}
              >
                <Icon name="delete" size={15} />
                削除
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

