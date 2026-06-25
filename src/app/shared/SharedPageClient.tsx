'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DesktopSharedView } from '@/components/desktop/DesktopShared';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { remoteRepository } from '@/lib/db/remote-repository';
import { invalidateHomeCache } from '@/lib/home-cache';
import { saveProjectSharedTags } from '@/lib/shared-projects/client';
import type {
  SharedDiscoverCategory,
  SharedDiscoverPayload,
  SharedProjectCard,
} from '@/lib/shared-projects/types';
import type { Project } from '@/types';
import { formatSharedTag, normalizeSharedTags, parseSharedTagsInput } from '../../../shared/shared-tags';

type SharedPageClientProps = {
  initialDiscover: SharedDiscoverPayload;
};

type DiscoverResponse = SharedDiscoverPayload | { error?: string };

type ShareCategory = Exclude<SharedDiscoverCategory, 'all'>;

const CATEGORY_META: Record<ShareCategory, { label: string; icon: string; description: string }> = {
  users: { label: 'ユーザー', icon: 'person', description: '公開単語帳を持つ学習者' },
  projects: { label: '単語帳', icon: 'menu_book', description: '公開されている単語帳' },
};

const EMPTY_DISCOVER: SharedDiscoverPayload = {
  category: 'all',
  users: [],
  projects: [],
  groups: [],
  nextCursor: null,
};

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

function buildDiscoverUrl(category: SharedDiscoverCategory, query: string, cursor?: string | null) {
  const params = new URLSearchParams({ category, limit: '12' });
  if (query.trim()) params.set('q', query.trim());
  if (cursor) params.set('cursor', cursor);
  return `/api/shared-projects/discover?${params.toString()}`;
}

function mergeDiscoverPage(current: SharedDiscoverPayload, incoming: SharedDiscoverPayload): SharedDiscoverPayload {
  const projectIds = new Set(current.projects.map((item) => item.project.id));
  const userIds = new Set(current.users.map((item) => item.userId));

  return {
    ...incoming,
    users: [...current.users, ...incoming.users.filter((item) => !userIds.has(item.userId))],
    projects: [...current.projects, ...incoming.projects.filter((item) => !projectIds.has(item.project.id))],
  };
}

function isDiscoverPayload(payload: DiscoverResponse | null): payload is SharedDiscoverPayload {
  return Boolean(payload && 'category' in payload && Array.isArray(payload.projects));
}

export default function SharedPageClient({ initialDiscover }: SharedPageClientProps) {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [category, setCategory] = useState<SharedDiscoverCategory>('all');
  const [query, setQuery] = useState('');
  const [discover, setDiscover] = useState<SharedDiscoverPayload>(initialDiscover);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const hasUsedInitialRef = useRef(false);

  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [ownProjects, setOwnProjects] = useState<Project[]>([]);
  const [ownProjectsLoading, setOwnProjectsLoading] = useState(false);
  const [ownProjectsError, setOwnProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [shareTagDraft, setShareTagDraft] = useState('');
  const [shareSaving, setShareSaving] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => ownProjects.find((project) => project.id === selectedProjectId) ?? null,
    [ownProjects, selectedProjectId],
  );

  useEffect(() => {
    const canUseInitial = !hasUsedInitialRef.current && category === 'all' && !query.trim() && refreshNonce === 0;
    if (canUseInitial) {
      hasUsedInitialRef.current = true;
      setDiscover(initialDiscover);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(buildDiscoverUrl(category, query), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as DiscoverResponse | null;
        if (!response.ok || !isDiscoverPayload(payload)) {
          throw new Error(payload && 'error' in payload ? payload.error : 'shared_discover_failed');
        }
        startTransition(() => setDiscover(payload));
      })
      .catch((loadError) => {
        if (controller.signal.aborted) return;
        console.error('Failed to discover shared projects:', loadError);
        setDiscover({ ...EMPTY_DISCOVER, category });
        setError('共有ライブラリを読み込めませんでした。');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [category, initialDiscover, query, refreshNonce]);

  const loadOwnProjects = useCallback(async () => {
    if (!user || !isPro) return;

    setOwnProjectsLoading(true);
    setOwnProjectsError(null);

    try {
      const projects = await remoteRepository.getProjects(user.id);
      const normalizedProjects = projects.map((project) => ({
        ...project,
        sharedTags: normalizeSharedTags(project.sharedTags),
      }));
      setOwnProjects(normalizedProjects);
      setSelectedProjectId((current) => {
        if (current && normalizedProjects.some((project) => project.id === current)) return current;
        return normalizedProjects[0]?.id ?? null;
      });
    } catch (loadError) {
      console.error('Failed to load own projects for sharing:', loadError);
      setOwnProjectsError('自分の単語帳を読み込めませんでした。');
    } finally {
      setOwnProjectsLoading(false);
    }
  }, [isPro, user]);

  useEffect(() => {
    if (!shareSheetOpen || !user || !isPro) return;
    void loadOwnProjects();
  }, [isPro, loadOwnProjects, shareSheetOpen, user]);

  useEffect(() => {
    if (!shareSheetOpen || !selectedProject || !user || !isPro) return;
    setShareTagDraft((selectedProject.sharedTags ?? []).map(formatSharedTag).join(', '));
  }, [isPro, selectedProject, shareSheetOpen, user]);

  async function handleLoadMore() {
    if (category === 'all' || !discover.nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError(null);

    try {
      const response = await fetch(buildDiscoverUrl(category, query, discover.nextCursor), { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as DiscoverResponse | null;
      if (!response.ok || !isDiscoverPayload(payload)) {
        throw new Error(payload && 'error' in payload ? payload.error : 'shared_discover_more_failed');
      }
      startTransition(() => setDiscover((current) => mergeDiscoverPage(current, payload)));
    } catch (loadError) {
      console.error('Failed to load more shared results:', loadError);
      setError('追加の検索結果を読み込めませんでした。');
    } finally {
      setLoadingMore(false);
    }
  }

  function handleOpenShareSheet() {
    setShareError(null);
    setOwnProjectsError(null);
    setShareSheetOpen(true);
  }

  function handleSelectCategory(nextCategory: ShareCategory) {
    setCategory(nextCategory);
    setError(null);
  }

  function handleBackToAll() {
    setCategory('all');
    setError(null);
  }

  async function handleSaveShare() {
    if (!selectedProject || shareSaving) return;

    setShareSaving(true);
    setShareError(null);

    try {
      let shareId = selectedProject.shareId;
      if (!shareId) {
        shareId = await remoteRepository.generateShareId(selectedProject.id);
      }

      const sharedTags = parseSharedTagsInput(shareTagDraft);
      await remoteRepository.updateProject(selectedProject.id, {
        shareScope: 'public',
      });
      const savedSharedTags = await saveProjectSharedTags(selectedProject.id, sharedTags);

      const updatedProject: Project = {
        ...selectedProject,
        shareId,
        shareScope: 'public',
        sharedTags: savedSharedTags,
      };
      setOwnProjects((current) => current.map((project) => (
        project.id === updatedProject.id ? updatedProject : project
      )));
      invalidateHomeCache();
      setRefreshNonce((value) => value + 1);
      setShareSheetOpen(false);
      showToast({ message: '単語帳を共有しました', type: 'success' });
    } catch (saveError) {
      console.error('Failed to save shared project:', saveError);
      const message = saveError instanceof Error ? saveError.message : '共有設定を保存できませんでした。';
      setShareError(message);
      showToast({ message, type: 'error' });
    } finally {
      setShareSaving(false);
    }
  }

  const allEmpty = discover.users.length === 0 && discover.projects.length === 0;

  return (
    <>
      <DesktopSharedView
        category={category}
        query={query}
        payload={discover}
        loading={loading}
        loadingMore={loadingMore}
        error={error}
        onQueryChange={setQuery}
        onCategorySelect={handleSelectCategory}
        onBackToAll={handleBackToAll}
        onLoadMore={() => void handleLoadMore()}
        onOpenShareSheet={handleOpenShareSheet}
      />

      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
        <div className="px-[18px] pb-2 pt-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
                COMMUNITY
              </div>
              <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] text-[var(--solid-ink)]">
                共有単語帳
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenShareSheet}
              aria-label="単語帳を共有"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="add" size={20} />
            </button>
          </div>
        </div>

        <div className="px-[14px] pt-2">
          <label className="flex min-w-0 items-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[var(--color-muted)]">
            <Icon name="search" size={16} />
            <span className="sr-only">共有ライブラリを検索</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={category === 'all' ? 'ユーザー・単語帳を検索' : `${CATEGORY_META[category].label}を検索`}
              className="min-w-0 flex-1 bg-transparent text-[13px] font-bold text-[var(--solid-ink)] outline-none placeholder:font-semibold placeholder:text-[var(--color-muted)]"
            />
          </label>
        </div>

        {category === 'all' ? (
          <div className="grid grid-cols-2 gap-2 px-[14px] py-3">
            {(Object.keys(CATEGORY_META) as ShareCategory[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectCategory(key)}
                className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-2 py-3 text-left transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <Icon name={CATEGORY_META[key].icon} size={19} className="text-[var(--solid-ink)]" />
                <div className="mt-2 text-[13px] font-extrabold text-[var(--solid-ink)]">{CATEGORY_META[key].label}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-[14px] py-3">
            <button
              type="button"
              onClick={handleBackToAll}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
              aria-label="カテゴリ一覧に戻る"
            >
              <Icon name="arrow_back" size={15} />
            </button>
            <div>
              <div className="text-[15px] font-extrabold text-[var(--solid-ink)]">{CATEGORY_META[category].label}</div>
              <div className="text-[10px] font-semibold text-[var(--color-muted)]">{CATEGORY_META[category].description}</div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 px-[14px]">
          {error && <ErrorBox message={error} />}
          {loading ? (
            <LoadingBox />
          ) : allEmpty ? (
            <EmptyBox message={query.trim() ? '検索結果がありません' : '公開中の項目はまだありません'} />
          ) : category === 'all' ? (
            <>
              <UserSection users={discover.users} />
              <ProjectSection projects={discover.projects} />
            </>
          ) : (
            <>
              {category === 'users' && <UserSection users={discover.users} />}
              {category === 'projects' && <ProjectSection projects={discover.projects} />}
              {discover.nextCursor && (
                <button
                  type="button"
                  onClick={() => void handleLoadMore()}
                  disabled={loadingMore}
                  className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-3 text-sm font-bold text-[var(--solid-ink)] disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name={loadingMore ? 'progress_activity' : 'expand_more'} size={18} className={loadingMore ? 'animate-spin' : undefined} />
                    {loadingMore ? '読み込み中...' : 'もっと見る'}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <ShareWordbookSheet
        open={shareSheetOpen}
        authLoading={authLoading}
        isLoggedIn={Boolean(user)}
        isPro={isPro}
        ownProjects={ownProjects}
        ownProjectsLoading={ownProjectsLoading}
        ownProjectsError={ownProjectsError}
        selectedProjectId={selectedProjectId}
        selectedProject={selectedProject}
        shareTagDraft={shareTagDraft}
        saving={shareSaving}
        error={shareError}
        onClose={() => setShareSheetOpen(false)}
        onLogin={() => router.push('/login?redirect=/shared')}
        onUpgrade={() => router.push('/subscription')}
        onRetryProjects={() => void loadOwnProjects()}
        onProjectSelect={setSelectedProjectId}
        onTagDraftChange={setShareTagDraft}
        onSave={() => void handleSaveShare()}
      />
    </>
  );
}

function SectionLabel({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <Icon name={icon} size={13} className="text-[var(--color-muted)]" />
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </div>
      <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">{count}</span>
    </div>
  );
}

function UserSection({ users }: { users: SharedDiscoverPayload['users'] }) {
  if (users.length === 0) return null;
  return (
    <section>
      <SectionLabel icon="person" label="ユーザー" count={users.length} />
      <div className="flex flex-col gap-2">
        {users.map((user) => (
          <div key={user.userId} className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
                {(user.username ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-extrabold text-[var(--solid-ink)]">
                  {user.username ? `@${user.username}` : 'ユーザー'}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                  {user.projectCount}冊 · {user.wordCount}語
                </div>
              </div>
              <div className="font-mono text-[10px] text-[var(--color-muted)]">{user.likeCount} likes</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectSection({ projects }: { projects: SharedProjectCard[] }) {
  if (projects.length === 0) return null;
  return (
    <section>
      <SectionLabel icon="menu_book" label="単語帳" count={projects.length} />
      <div className="flex flex-col gap-2">
        {projects.map((project) => <ProjectCard key={project.project.id} project={project} />)}
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const bg = thumbColor(project.project.id);
  const ownerLabel = project.accessRole === 'owner'
    ? '自分'
    : project.ownerUsername
      ? `@${project.ownerUsername}`
      : '共有ユーザー';

  return (
    <Link href={href} className="block">
      <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-3 transition-all duration-100 active:translate-x-px active:translate-y-px">
        <div className="flex items-center gap-[11px]">
          <div
            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[10px] border-2 bg-cover bg-center font-display text-[22px] font-extrabold text-white"
            style={{
              backgroundColor: bg,
              backgroundImage: project.project.iconImage ? `url(${project.project.iconImage})` : undefined,
              borderColor: 'var(--solid-ink)',
            }}
          >
            {!project.project.iconImage && project.project.title.charAt(0)}
          </div>

          <div className="min-w-0 flex-1">
            <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-display text-[14px] font-bold text-[var(--solid-ink)]">
              {project.project.title}
            </span>
            <div className="mt-[3px] flex items-center gap-1.5">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--color-muted)]">
                {ownerLabel}
              </span>
              <span className="text-[11px] text-[var(--color-muted)] opacity-50">.</span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
                {project.wordCount === undefined ? '読込中' : `${project.wordCount} 語`}
              </span>
            </div>
          </div>

          <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
        </div>

        {(project.project.sharedTags ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-[61px]">
            {project.project.sharedTags!.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-muted)]">
                {formatSharedTag(tag)}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function LoadingBox() {
  return (
    <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-5 text-sm font-bold text-[var(--color-muted)]">
      <Icon name="progress_activity" size={16} className="mr-1 inline animate-spin" />
      検索中...
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
      {message}
    </div>
  );
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-12 text-center text-sm font-bold text-[var(--color-muted)]">
      {message}
    </div>
  );
}

function ShareWordbookSheet({
  open,
  authLoading,
  isLoggedIn,
  isPro,
  ownProjects,
  ownProjectsLoading,
  ownProjectsError,
  selectedProjectId,
  selectedProject,
  shareTagDraft,
  saving,
  error,
  onClose,
  onLogin,
  onUpgrade,
  onRetryProjects,
  onProjectSelect,
  onTagDraftChange,
  onSave,
}: {
  open: boolean;
  authLoading: boolean;
  isLoggedIn: boolean;
  isPro: boolean;
  ownProjects: Project[];
  ownProjectsLoading: boolean;
  ownProjectsError: string | null;
  selectedProjectId: string | null;
  selectedProject: Project | null;
  shareTagDraft: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onLogin: () => void;
  onUpgrade: () => void;
  onRetryProjects: () => void;
  onProjectSelect: (projectId: string) => void;
  onTagDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  if (!open) return null;

  const canSave = Boolean(selectedProject) && !saving && !ownProjectsLoading;

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onClose}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />

      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 520,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
            maxHeight: 'min(88vh, 720px)',
            overflowY: 'auto',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                SHARE
              </div>
              <div className="mt-0.5 truncate font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
                単語帳を共有
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          {authLoading ? (
            <SheetState icon="progress_activity" spin message="確認中..." />
          ) : !isLoggedIn ? (
            <SheetActionState icon="login" message="ログインすると単語帳を共有できます。" actionLabel="ログイン" onAction={onLogin} />
          ) : !isPro ? (
            <SheetActionState icon="auto_awesome" message="単語帳の共有はPro限定です。" actionLabel="Proを見る" onAction={onUpgrade} />
          ) : (
            <>
              <SheetSection icon="menu_book" label="単語帳">
                {ownProjectsLoading ? (
                  <SheetState icon="progress_activity" spin message="読み込み中..." />
                ) : ownProjectsError ? (
                  <div className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
                    {ownProjectsError}
                    <button type="button" className="ml-2 underline" onClick={onRetryProjects}>再読み込み</button>
                  </div>
                ) : ownProjects.length === 0 ? (
                  <div className="rounded-[10px] border border-[var(--color-border)] bg-white px-3 py-3 text-[12px] text-[var(--color-muted)]">
                    共有できる単語帳がありません
                  </div>
                ) : (
                  <div className="flex max-h-[190px] flex-col gap-2 overflow-y-auto pr-1">
                    {ownProjects.map((project) => {
                      const selected = selectedProjectId === project.id;
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => onProjectSelect(project.id)}
                          className="flex items-center gap-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-left"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--solid-ink)] font-display text-[13px] font-extrabold text-white"
                            style={{ background: thumbColor(project.id) }}
                          >
                            {project.title.charAt(0)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--solid-ink)]">{project.title}</span>
                          <Icon name={selected ? 'check' : 'chevron_right'} size={15} className={selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </SheetSection>

              <SheetSection icon="sell" label="タグ">
                <input
                  value={shareTagDraft}
                  onChange={(event) => onTagDraftChange(event.target.value)}
                  placeholder="例: /TOEIC, /熟語, /高校英語"
                  className="w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-[13px] font-bold text-[var(--solid-ink)] outline-none"
                />
                <div className="mt-1.5 text-[10px] font-semibold text-[var(--color-muted)]">
                  先頭に / を付けて最大8個
                </div>
              </SheetSection>

              {error && (
                <div className="mb-3 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-3 text-[14px] font-extrabold text-white disabled:opacity-45"
              >
                <Icon name={saving ? 'progress_activity' : 'check'} size={17} className={saving ? 'animate-spin' : undefined} />
                {saving ? '保存中...' : '共有する'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetSection({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <Icon name={icon} size={11} />
        {label}
      </div>
      {children}
    </div>
  );
}

function SheetState({ icon, message, spin = false }: { icon: string; message: string; spin?: boolean }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-3 text-[12px] font-bold text-[var(--color-muted)]">
      <Icon name={icon} size={15} className={spin ? 'animate-spin' : undefined} />
      {message}
    </div>
  );
}

function SheetActionState({
  icon,
  message,
  actionLabel,
  onAction,
}: {
  icon: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-white p-4 text-center">
      <Icon name={icon} size={28} className="text-[var(--solid-ink)]" />
      <div className="mt-2 text-[13px] font-bold text-[var(--solid-ink)]">{message}</div>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 py-2 text-[12px] font-extrabold text-white"
      >
        {actionLabel}
      </button>
    </div>
  );
}
