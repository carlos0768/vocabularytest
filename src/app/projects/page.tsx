'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, AppShell } from '@/components/ui';
import { ProjectCard } from '@/components/project';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import type { Project, Word } from '@/types';

interface ProjectWithStats extends Project {
  totalWords: number;
  masteredWords: number;
  progress: number;
}

async function addStatsToProjects(
  projects: Project[],
  repo: { getWords(projectId: string): Promise<Word[]> },
): Promise<ProjectWithStats[]> {
  return Promise.all(
    projects.map(async (project): Promise<ProjectWithStats> => {
      let words: Word[] = [];
      try {
        words = await repo.getWords(project.id);
      } catch {
        // ignore
      }
      const mastered = words.filter((w: Word) => w.status === 'mastered').length;
      const total = words.length;
      const progress = total > 0 ? Math.round((mastered / total) * 100) : 0;
      return { ...project, totalWords: total, masteredWords: mastered, progress };
    })
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, subscription, loading: authLoading, isPro } = useAuth();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Phase 1: Instant local load (no auth dependency)
  const hasLocalLoadedRef = useRef(false);
  useEffect(() => {
    if (hasLocalLoadedRef.current) return;
    hasLocalLoadedRef.current = true;

    (async () => {
      try {
        const guestId = getGuestUserId();
        const localProjects = await localRepository.getProjects(guestId);
        if (localProjects.length > 0) {
          const withStats = await addStatsToProjects(localProjects, localRepository);
          setProjects(withStats);
          setLoading(false);
        }
      } catch (e) {
        console.error('Local projects load failed:', e);
      }
    })();
  }, []);

  // Phase 2: Remote update after auth resolves (Pro users)
  useEffect(() => {
    if (authLoading) return;

    (async () => {
      try {
        const userId = isPro && user ? user.id : getGuestUserId();

        if (!user) {
          // Free user: local is the source of truth — if Phase 1 already loaded, done
          if (projects.length > 0) {
            setLoading(false);
            return;
          }
          const localProjects = await repository.getProjects(userId);
          const withStats = await addStatsToProjects(localProjects, repository);
          setProjects(withStats);
          setLoading(false);
          return;
        }

        // Pro user: fetch from remote for latest data
        let remoteProjects: Project[] = [];
        try {
          remoteProjects = await remoteRepository.getProjects(user.id);
        } catch (e) {
          console.error('Remote fetch failed:', e);
        }

        if (remoteProjects.length > 0) {
          const withStats = await addStatsToProjects(remoteProjects, remoteRepository);
          setProjects(withStats);
        } else if (projects.length === 0) {
          // Fallback to default repository
          const fallback = await repository.getProjects(userId);
          const withStats = await addStatsToProjects(fallback, repository);
          setProjects(withStats);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, isPro, user, repository]); // eslint-disable-line react-hooks/exhaustive-deps

  const favorites = projects.filter((project) => project.isFavorite);
  const filtered = projects.filter((project) =>
    project.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AppShell>
    <div className="min-h-screen pb-28 lg:pb-6">
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語帳</h1>
            <p className="text-sm text-[var(--color-muted)]">学習を続ける単語帳を選択</p>
          </div>
          <Link
            href="/scan"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-sm font-semibold"
          >
            <Icon name="add" size={16} />
            新規スキャン
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="単語帳を検索"
            className="w-full pl-10 pr-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--color-muted)]">単語検索や意味検索はこちら</p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] text-xs font-semibold hover:border-[var(--color-primary)] transition-colors"
          >
            <Icon name="search" size={14} />
            単語検索へ
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2">読み込み中...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center">
              <Icon name="star" size={24} className="text-[var(--color-primary)]" />
            </div>
            <h2 className="mt-4 text-lg font-bold">まだ単語帳がありません</h2>
            <p className="text-sm text-[var(--color-muted)] mt-2">スキャンから最初の単語帳を作成しましょう</p>
            <Link
              href="/scan"
              className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-full bg-primary text-white font-semibold"
            >
              スキャンを始める
            </Link>
          </div>
        ) : (
          <>
            {favorites.length > 0 && query.trim().length === 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--color-muted)]">お気に入り</h2>
                  <span className="text-xs text-[var(--color-muted)]">{favorites.length}件</span>
                </div>
                <div className="space-y-3">
                  {favorites.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      wordCount={project.totalWords}
                      masteredCount={project.masteredWords}
                      progress={project.progress}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--color-muted)]">すべての単語帳</h2>
                <span className="text-xs text-[var(--color-muted)]">{filtered.length}件</span>
              </div>
              <div className="space-y-3">
                {filtered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    wordCount={project.totalWords}
                    masteredCount={project.masteredWords}
                    progress={project.progress}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
    </AppShell>
  );
}
