'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Flag, Loader2, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SubscriptionStatus } from '@/types';

interface FavoriteWord extends Word {
  projectTitle: string;
}

export default function FavoritesPage() {
  const { user, subscription, loading: authLoading } = useAuth();

  const [favorites, setFavorites] = useState<FavoriteWord[]>([]);
  const [loading, setLoading] = useState(true);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  useEffect(() => {
    if (authLoading) return;

    const loadFavorites = async () => {
      try {
        if (!user) {
          setLoading(false);
          return;
        }

        const projects = await repository.getProjects(user.id);
        const projectIds = projects.map((project) => project.id);
        const projectTitleMap = new Map(projects.map((project) => [project.id, project.title]));

        if (projectIds.length === 0) {
          setFavorites([]);
          return;
        }

        const repoWithBulk = repository as typeof repository & {
          getAllWordsByProjectIds?: (ids: string[]) => Promise<Record<string, Word[]>>;
          getAllWordsByProject?: (ids: string[]) => Promise<Record<string, Word[]>>;
        };

        let wordsByProject: Record<string, Word[]>;

        if (repoWithBulk.getAllWordsByProjectIds) {
          wordsByProject = await repoWithBulk.getAllWordsByProjectIds(projectIds);
        } else if (repoWithBulk.getAllWordsByProject) {
          wordsByProject = await repoWithBulk.getAllWordsByProject(projectIds);
        } else {
          const wordsArrays = await Promise.all(projectIds.map((id) => repository.getWords(id)));
          wordsByProject = Object.fromEntries(
            projectIds.map((id, index) => [id, wordsArrays[index] ?? []])
          );
        }

        const allFavorites = projectIds.flatMap((projectId) => {
          const words = wordsByProject[projectId] ?? [];
          const projectTitle = projectTitleMap.get(projectId) ?? '';
          return words
            .filter((w) => w.isFavorite)
            .map((w) => ({
              ...w,
              projectTitle,
            }));
        });

        setFavorites(allFavorites);
      } catch (error) {
        console.error('Failed to load favorites:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFavorites();
  }, [user, repository, authLoading]);

  const handleToggleFavorite = async (wordId: string) => {
    const word = favorites.find((w) => w.id === wordId);
    if (!word) return;

    await repository.updateWord(wordId, { isFavorite: false });
    setFavorites((prev) => prev.filter((w) => w.id !== wordId));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-[var(--color-background)]">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 border-b border-[var(--color-border)] z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 hover:bg-[var(--color-peach-light)] rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Flag className="w-5 h-5 fill-[var(--color-warning)] text-[var(--color-warning)]" />
              <h1 className="text-lg font-semibold text-[var(--color-foreground)]">苦手な単語</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {favorites.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center mx-auto mb-4">
              <Flag className="w-8 h-8 text-[var(--color-muted)]" />
            </div>
            <h2 className="text-lg font-medium text-[var(--color-foreground)] mb-2">
              苦手な単語はありません
            </h2>
            <p className="text-[var(--color-muted)] mb-6">
              クイズ中にフラグをタップして
              <br />
              苦手な単語をマークしましょう
            </p>
            <Link href="/">
              <Button variant="secondary">
                <BookOpen className="w-4 h-4 mr-2" />
                単語帳を見る
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="bg-[var(--color-warning-light)] rounded-[var(--radius-lg)] p-4 mb-6 border border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[var(--color-warning)] text-sm font-medium">苦手な単語</p>
                  <p className="text-2xl font-bold text-[var(--color-foreground)]">{favorites.length}語</p>
                </div>
                <Flag className="w-10 h-10 fill-[var(--color-warning-light)] text-[var(--color-warning)]" />
              </div>
            </div>

            {/* Word list */}
            <div className="space-y-2">
              {favorites.map((word) => (
                <div
                  key={word.id}
                  className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 group hover:shadow-card transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-[var(--color-foreground)]">{word.english}</p>
                        <Flag className="w-4 h-4 fill-[var(--color-warning)] text-[var(--color-warning)]" />
                      </div>
                      <p className="text-[var(--color-muted)]">{word.japanese}</p>
                      <Link
                        href={`/project/${word.projectId}`}
                        className="text-xs text-[var(--color-primary)] hover:underline mt-1 inline-block"
                      >
                        {word.projectTitle}
                      </Link>
                    </div>
                    <button
                      onClick={() => handleToggleFavorite(word.id)}
                      className="p-2 hover:bg-[var(--color-warning-light)] rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="苦手を解除"
                    >
                      <Flag className="w-5 h-5 fill-[var(--color-warning)] text-[var(--color-warning)]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
