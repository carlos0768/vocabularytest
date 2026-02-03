'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Plus, Star, Loader2 } from 'lucide-react';
import { BottomNav } from '@/components/ui';
import { ProjectCard } from '@/components/project';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import type { Project, Word } from '@/types';

interface ProjectWithStats extends Project {
  totalWords: number;
  masteredWords: number;
  progress: number;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, subscription, loading: authLoading, isPro } = useAuth();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  useEffect(() => {
    if (authLoading) return;

    const loadProjects = async () => {
      setLoading(true);
      try {
        const userId = isPro && user ? user.id : getGuestUserId();
        const loadedProjects = await repository.getProjects(userId);

        const stats = await Promise.all(
          loadedProjects.map(async (project): Promise<ProjectWithStats> => {
            const words = await repository.getWords(project.id);
            const mastered = words.filter((w: Word) => w.status === 'mastered').length;
            const total = words.length;
            const progress = total > 0 ? Math.round((mastered / total) * 100) : 0;
            return {
              ...project,
              totalWords: total,
              masteredWords: mastered,
              progress,
            };
          })
        );

        setProjects(stats);
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [authLoading, isPro, user, repository]);

  const favorites = projects.filter((project) => project.isFavorite);
  const filtered = projects.filter((project) =>
    project.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">プロジェクト</h1>
            <p className="text-sm text-[var(--color-muted)]">学習を続ける単語帳を選択</p>
          </div>
          <Link
            href="/scan"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--color-peach-light)] text-[var(--color-primary)] text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            新規スキャン
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="プロジェクトを検索"
            className="w-full pl-10 pr-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--color-muted)]">単語検索や意味検索はこちら</p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] text-xs font-semibold hover:border-[var(--color-primary)] transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            単語検索へ
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="ml-2">読み込み中...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-[var(--color-peach-light)] flex items-center justify-center">
              <Star className="w-6 h-6 text-[var(--color-primary)]" />
            </div>
            <h2 className="mt-4 text-lg font-bold">まだプロジェクトがありません</h2>
            <p className="text-sm text-[var(--color-muted)] mt-2">スキャンから最初の単語帳を作成しましょう</p>
            <Link
              href="/scan"
              className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-full bg-gradient-to-br from-[#FF6B6B] to-[#FFB347] text-white font-semibold"
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
                <h2 className="text-sm font-semibold text-[var(--color-muted)]">すべてのプロジェクト</h2>
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

      <BottomNav />
    </div>
  );
}
