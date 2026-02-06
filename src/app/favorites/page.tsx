'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Flag, Loader2, BookOpen, BarChart3, Sparkles } from 'lucide-react';
import { BottomNav } from '@/components/ui';
import { StudyModeCard, WordList } from '@/components/home';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import { getGuestUserId } from '@/lib/utils';
import type { Word, Project, SubscriptionStatus } from '@/types';

interface FavoriteWord extends Word {
  projectTitle: string;
}

const tabs = [
  { id: 'study', label: '学習' },
  { id: 'words', label: '単語' },
  { id: 'stats', label: '統計' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function FavoritesPage() {
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const [favorites, setFavorites] = useState<FavoriteWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('study');
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  const loadFavorites = useCallback(async () => {
    if (authLoading) return;

    try {
      const userId = isPro && user ? user.id : getGuestUserId();
      const projects = await repository.getProjects(userId);
      const projectIds = projects.map((project) => project.id);
      const projectTitleMap = new Map(projects.map((project) => [project.id, project.title]));

      if (projectIds.length === 0) {
        setFavorites([]);
        setLoading(false);
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
  }, [authLoading, user, isPro, repository]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const handleToggleFavorite = async (wordId: string) => {
    const word = favorites.find((w) => w.id === wordId);
    if (!word) return;

    await repository.updateWord(wordId, { isFavorite: false });
    setFavorites((prev) => prev.filter((w) => w.id !== wordId));
  };

  const handleUpdateWord = async (wordId: string, english: string, japanese: string) => {
    await repository.updateWord(wordId, { english, japanese });
    setFavorites((prev) => prev.map((w) => (w.id === wordId ? { ...w, english, japanese } : w)));
    setEditingWordId(null);
  };

  const handleDeleteWord = async (wordId: string) => {
    // Just remove from favorites, don't delete the word
    await handleToggleFavorite(wordId);
  };

  const stats = useMemo(() => {
    const total = favorites.length;
    const mastered = favorites.filter((w) => w.status === 'mastered').length;
    const review = favorites.filter((w) => w.status === 'review').length;
    const newWords = favorites.filter((w) => w.status === 'new').length;
    return { total, mastered, review, newWords };
  }, [favorites]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="ml-2">読み込み中...</span>
      </div>
    );
  }

  const returnPath = encodeURIComponent('/favorites');

  // Get first project ID for quiz/flashcard (they need a project context)
  // For favorites, we'll use a special "all" mode
  const firstProjectId = favorites.length > 0 ? favorites[0].projectId : null;

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 hover:bg-[var(--color-peach-light)] rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 fill-[var(--color-warning)] text-[var(--color-warning)]" />
                <h1 className="text-lg font-bold text-[var(--color-foreground)]">苦手な単語</h1>
              </div>
              <p className="text-xs text-[var(--color-muted)]">{stats.total}語 / 習得 {stats.mastered}語</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {favorites.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-[var(--color-warning-light)] rounded-full flex items-center justify-center mx-auto mb-4">
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
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[var(--color-warning)] text-white border-[var(--color-warning)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Study Tab */}
            {activeTab === 'study' && firstProjectId && (
              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <StudyModeCard
                    title="苦手クイズ"
                    description="苦手な単語を復習"
                    icon={BookOpen}
                    href={isPro ? `/quiz/${firstProjectId}/favorites?from=${returnPath}` : '/subscription'}
                    variant="red"
                    badge={!isPro ? 'Pro' : undefined}
                  />
                  <StudyModeCard
                    title="苦手カード"
                    description="スワイプで確認"
                    icon={BarChart3}
                    href={isPro ? `/flashcard/${firstProjectId}?favorites=true&from=${returnPath}` : '/subscription'}
                    variant="blue"
                    badge={!isPro ? 'Pro' : undefined}
                  />
                </div>
                <StudyModeCard
                  title="苦手例文クイズ"
                  description="例文で記憶を定着"
                  icon={Sparkles}
                  href={isPro ? `/sentence-quiz/${firstProjectId}?favorites=true&from=${returnPath}` : '/subscription'}
                  variant="orange"
                  badge={!isPro ? 'Pro' : undefined}
                />
              </section>
            )}

            {/* Words Tab */}
            {activeTab === 'words' && (
              <section>
                <WordList
                  words={favorites}
                  editingWordId={editingWordId}
                  onEditStart={(wordId) => setEditingWordId(wordId)}
                  onEditCancel={() => setEditingWordId(null)}
                  onSave={(wordId, english, japanese) => handleUpdateWord(wordId, english, japanese)}
                  onDelete={(wordId) => handleDeleteWord(wordId)}
                  onToggleFavorite={(wordId) => handleToggleFavorite(wordId)}
                  showProjectName
                />
              </section>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && (
              <section className="grid grid-cols-2 gap-3">
                <div className="card p-4">
                  <p className="text-xs text-[var(--color-muted)]">苦手単語</p>
                  <p className="text-2xl font-bold text-[var(--color-warning)] mt-2">{stats.total}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-[var(--color-muted)]">習得済み</p>
                  <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.mastered}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-[var(--color-muted)]">復習中</p>
                  <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.review}</p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-[var(--color-muted)]">未学習</p>
                  <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.newWords}</p>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
