'use client';

import { startTransition, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
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

type AccessibleProjectsResponse = {
  owned?: SharedProjectCard[];
  joined?: SharedProjectCard[];
};

type PublicProjectsResponse = {
  items?: SharedProjectCard[];
  nextCursor?: string | null;
};

type MetricsResponse = {
  metrics?: SharedProjectMetricsMap;
};

const iconColors = ['bg-red-500', 'bg-green-600', 'bg-blue-900', 'bg-orange-500', 'bg-purple-600', 'bg-teal-600'];

const SHARED_ME_STORAGE_PREFIX = 'merken_shared_me:v1:';

function readSharedMeCache(userId: string): { owned: SharedProjectCard[]; joined: SharedProjectCard[] } | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SHARED_ME_STORAGE_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { owned?: unknown; joined?: unknown };
    return {
      owned: Array.isArray(parsed.owned) ? (parsed.owned as SharedProjectCard[]) : [],
      joined: Array.isArray(parsed.joined) ? (parsed.joined as SharedProjectCard[]) : [],
    };
  } catch {
    return null;
  }
}

function writeSharedMeCache(
  userId: string,
  owned: SharedProjectCard[],
  joined: SharedProjectCard[],
) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SHARED_ME_STORAGE_PREFIX + userId, JSON.stringify({ owned, joined }));
  } catch {
    // ignore quota / private mode
  }
}

export default function SharedPageClient({
  initialPublicItems,
  initialPublicNextCursor,
}: SharedPageClientProps) {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [ownedProjects, setOwnedProjects] = useState<SharedProjectCard[]>([]);
  const [joinedProjects, setJoinedProjects] = useState<SharedProjectCard[]>([]);
  const [publicProjects, setPublicProjects] = useState<SharedProjectCard[]>(initialPublicItems);
  const [publicNextCursor, setPublicNextCursor] = useState<string | null>(initialPublicNextCursor);
  const [userSectionLoading, setUserSectionLoading] = useState(true);
  const [loadingMorePublic, setLoadingMorePublic] = useState(false);
  const [userSectionError, setUserSectionError] = useState<string | null>(null);
  const [publicSectionError, setPublicSectionError] = useState<string | null>(null);
  const pendingMetricIdsRef = useRef(new Set<string>());

  const applyMetrics = useEffectEvent((metrics: SharedProjectMetricsMap) => {
    startTransition(() => {
      setOwnedProjects((current) => mergeMetricsIntoCards(current, metrics));
      setJoinedProjects((current) => mergeMetricsIntoCards(current, metrics));
      setPublicProjects((current) => mergeMetricsIntoCards(current, metrics));
    });
  });

  const requestMetrics = useEffectEvent(async (projectIds: string[]) => {
    const nextIds = projectIds.filter((projectId) => !pendingMetricIdsRef.current.has(projectId));
    if (nextIds.length === 0) {
      return;
    }

    for (const projectId of nextIds) {
      pendingMetricIdsRef.current.add(projectId);
    }

    try {
      const response = await fetch(`/api/shared-projects/metrics?projectIds=${encodeURIComponent(nextIds.join(','))}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        return;
      }

      const payload = await response.json() as MetricsResponse;
      if (!payload.metrics) {
        return;
      }

      applyMetrics(payload.metrics);
    } catch {
      // Keep placeholders when metrics fail.
    } finally {
      for (const projectId of nextIds) {
        pendingMetricIdsRef.current.delete(projectId);
      }
    }
  });

  // Hydrate from session cache before paint so revisiting /shared avoids skeleton flash (public list already SSR’d).
  useLayoutEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated || !user?.id) {
      setOwnedProjects([]);
      setJoinedProjects([]);
      setUserSectionLoading(false);
      return;
    }

    const cached = readSharedMeCache(user.id);
    if (cached) {
      setOwnedProjects(cached.owned);
      setJoinedProjects(cached.joined);
      setUserSectionLoading(false);
    }
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    if (authLoading) {
      setUserSectionLoading(true);
      return;
    }

    if (!isAuthenticated || !user?.id) {
      setUserSectionLoading(false);
      setUserSectionError(null);
      setOwnedProjects([]);
      setJoinedProjects([]);
      return;
    }

    const controller = new AbortController();
    const hadCache = readSharedMeCache(user.id) != null;

    if (!hadCache) {
      setUserSectionLoading(true);
    }
    setUserSectionError(null);

    fetch('/api/shared-projects/me', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('shared_me_fetch_failed');
        }

        return response.json() as Promise<AccessibleProjectsResponse>;
      })
      .then((payload) => {
        const owned = payload.owned ?? [];
        const joined = payload.joined ?? [];
        writeSharedMeCache(user.id, owned, joined);
        startTransition(() => {
          setOwnedProjects(owned);
          setJoinedProjects(joined);
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        console.error('Failed to load personal shared projects:', error);
        if (!hadCache) {
          setUserSectionError('自分の共有単語帳を読み込めませんでした。');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setUserSectionLoading(false);
        }
      });

    return () => controller.abort();
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    const projectIds = collectMetricProjectIds(ownedProjects, joinedProjects, publicProjects);
    if (projectIds.length === 0) {
      return;
    }

    requestMetrics(projectIds);
  }, [ownedProjects, joinedProjects, publicProjects]);

  async function handleLoadMorePublic() {
    if (!publicNextCursor || loadingMorePublic) {
      return;
    }

    setLoadingMorePublic(true);
    setPublicSectionError(null);

    try {
      const response = await fetch(
        `/api/shared-projects/public?limit=8&cursor=${encodeURIComponent(publicNextCursor)}`,
        { cache: 'no-store' },
      );

      if (!response.ok) {
        throw new Error('shared_public_fetch_failed');
      }

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

  return (
    <div className="min-h-screen pb-24 lg:pb-6">
      <header className="px-5 pt-6 pb-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-black text-[var(--color-foreground)] text-center">共有</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 pb-8 space-y-8">
        {(!isAuthenticated ||
          userSectionLoading ||
          userSectionError != null ||
          ownedProjects.length > 0 ||
          joinedProjects.length > 0) && (
          <section className="space-y-4">
            <SectionHeader title="自分の共有 / 参加中" />

            {userSectionLoading ? (
              <ProjectSkeletonList count={3} />
            ) : !isAuthenticated ? (
              <div className="card p-5 text-center">
                <Icon name="lock" size={36} className="text-[var(--color-muted)] mx-auto mb-3" />
                <p className="font-bold text-[var(--color-foreground)]">ログインすると自分の共有が表示されます</p>
                <p className="text-sm text-[var(--color-muted)] mt-2 mb-4">
                  公開単語帳のプレビューはこのまま閲覧できます。
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold"
                >
                  <Icon name="login" size={18} />
                  ログイン
                </Link>
              </div>
            ) : userSectionError ? (
              <InlineMessage icon="error" tone="error" message={userSectionError} />
            ) : (
              <div className="space-y-6">
                <ProjectGroup
                  title="自分が公開した単語帳"
                  emptyMessage="まだ公開している単語帳はありません。"
                  items={ownedProjects}
                />
                {joinedProjects.length > 0 ? (
                  <ProjectGroup
                    title="参加中の共有単語帳"
                    emptyMessage="参加中の共有単語帳はありません。"
                    items={joinedProjects}
                  />
                ) : null}
              </div>
            )}
          </section>
        )}

        <section className="space-y-4">
          <SectionHeader title="共有単語帳" trailing={`${publicProjects.length}件表示`} />

          {publicProjects.length === 0 ? (
            <div className="card p-5 text-center">
              <Icon name="public" size={36} className="text-[var(--color-muted)] mx-auto mb-3" />
              <p className="font-bold text-[var(--color-foreground)]">公開中の単語帳はまだありません</p>
              <p className="text-sm text-[var(--color-muted)] mt-2">
                公開設定された単語帳がここに表示されます。
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {publicProjects.map((project) => (
                <ProjectCard key={project.project.id} project={project} />
              ))}
            </div>
          )}

          {publicSectionError ? (
            <InlineMessage icon="error" tone="error" message={publicSectionError} />
          ) : null}

          {publicNextCursor ? (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={handleLoadMorePublic}
                disabled={loadingMorePublic}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-foreground)] font-semibold disabled:opacity-60"
              >
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
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  trailing,
}: {
  title: string;
  description?: string;
  trailing?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-black text-[var(--color-foreground)]">{title}</h2>
        {description ? (
          <p className="text-sm text-[var(--color-muted)] mt-1">{description}</p>
        ) : null}
      </div>
      {trailing ? (
        <span className="text-xs font-medium text-[var(--color-muted)] shrink-0 pt-1">{trailing}</span>
      ) : null}
    </div>
  );
}

function ProjectGroup({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: SharedProjectCard[];
  emptyMessage: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--color-foreground)]">{title}</h3>
        <span className="text-xs text-[var(--color-muted)]">{items.length}件</span>
      </div>

      {items.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--color-muted)]">{emptyMessage}</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ProjectCard key={item.project.id} project={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: SharedProjectCard }) {
  const href = project.project.shareId ? `/share/${project.project.shareId}` : '/shared';
  const colorIndex = project.project.title.length % iconColors.length;
  const badgeLabel = project.accessRole === 'owner'
    ? '自分の公開'
    : project.accessRole === 'editor'
      ? '参加中'
      : '公開中';
  const ownerLabel = project.accessRole === 'owner'
    ? 'あなたの単語帳'
    : project.ownerUsername
      ? `${project.ownerUsername}さんの単語帳`
      : '共有された単語帳';

  return (
    <Link
      href={href}
      className="card p-4 flex items-center gap-4 active:opacity-80 transition-opacity"
    >
      <div className={`w-14 h-14 rounded-xl ${iconColors[colorIndex]} flex items-center justify-center text-white text-xl font-bold shrink-0`}>
        {project.project.title.charAt(0) === 'ス' ? 'ス' : project.project.title.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-[var(--color-foreground)] truncate">{project.project.title}</p>
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-green-50 text-green-600 text-[11px] font-semibold border border-green-200">
            {badgeLabel}
          </span>
        </div>

        <p className="text-xs text-[var(--color-muted)] mt-1 truncate">{ownerLabel}</p>

        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--color-muted)]">
          <CountChip icon="description" value={project.wordCount} suffix="語" />
          <CountChip icon="group" value={project.collaboratorCount} suffix="人" />
        </div>
      </div>

      <Icon name="chevron_right" size={20} className="text-[var(--color-muted)] shrink-0" />
    </Link>
  );
}

function CountChip({
  icon,
  value,
  suffix,
}: {
  icon: string;
  value: number | undefined;
  suffix: string;
}) {
  return (
    <span className="flex items-center gap-1 min-w-0">
      <Icon name={icon} size={14} />
      {value === undefined ? (
        <span className="inline-flex items-center gap-1">
          <span className="w-7 h-3 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
          <span>読込中</span>
        </span>
      ) : (
        <span>{value}{suffix}</span>
      )}
    </span>
  );
}

function ProjectSkeletonList({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[var(--color-surface-secondary)] animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-40 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            <div className="h-3 w-28 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            <div className="flex items-center gap-3">
              <div className="h-3 w-20 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
              <div className="h-3 w-20 rounded bg-[var(--color-surface-secondary)] animate-pulse" />
            </div>
          </div>
          <div className="w-5 h-5 rounded bg-[var(--color-surface-secondary)] animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

function InlineMessage({
  icon,
  message,
  tone,
}: {
  icon: string;
  message: string;
  tone: 'error' | 'info';
}) {
  const className = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]';

  return (
    <div className={`card p-4 flex items-center gap-3 ${className}`}>
      <Icon name={icon} size={18} />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
