'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { StudyModeCard, WordList } from '@/components/home';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import { getGuestUserId } from '@/lib/utils';
import type { Word, SubscriptionStatus } from '@/types';

interface FavoriteWord extends Word {
  projectTitle: string;
}

const tabs = [
  { id: 'study', label: '学習', icon: 'school' },
  { id: 'words', label: '単語', icon: 'menu_book' },
  { id: 'stats', label: '統計', icon: 'insights' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function FavoritesPage() {
  const { user, subscription, loading: authLoading, isPro } = useAuth();

  const [favorites, setFavorites] = useState<FavoriteWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('study');
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const loadFavorites = useCallback(async () => {
    if (authLoading) return;

    try {
      const userId = user ? user.id : getGuestUserId();
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
  }, [authLoading, user, repository]);

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
        <Icon name="progress_activity" size={20} className="animate-spin text-[var(--color-primary)]" />
        <span className="ml-2">読み込み中...</span>
      </div>
    );
  }

  const returnPath = encodeURIComponent('/favorites');

  // Get unique project IDs from favorites for quiz/flashcard links
  const favoriteProjectIds = [...new Set(favorites.map(f => f.projectId))];
  const firstProjectId = favoriteProjectIds.length > 0 ? favoriteProjectIds[0] : null;

  return (
    <>
    <div className="min-h-screen pb-28 lg:pb-6">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg lg:max-w-2xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="p-2 -ml-2 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
            >
              <Icon name="arrow_back" size={20} />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Icon name="flag" size={20} filled className="text-[var(--color-warning)]" />
                <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate">苦手単語</h1>
              </div>
              <p className="text-sm text-[var(--color-muted)]">{stats.total}語 / 習得 {stats.mastered}語</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-lg lg:max-w-2xl mx-auto px-4 lg:px-8 py-6 space-y-6">
        {favorites.length === 0 ? (
          <section className="card p-8 lg:p-10 text-center border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt,var(--color-surface))]">
            <div className="w-16 h-16 mx-auto bg-[var(--color-surface)] rounded-full flex items-center justify-center border-2 border-[var(--color-border)] mb-4">
              <Icon name="flag" size={30} className="text-[var(--color-warning)]" />
            </div>
            <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-2">苦手単語はまだありません</h2>
            <p className="text-sm text-[var(--color-muted)] mb-6 max-w-[280px] mx-auto">
              クイズや単語一覧のフラグを使って、後で見直したい単語をまとめましょう。
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning)] text-sm font-semibold border-2 border-[var(--color-warning)]/20 border-b-[3px] active:border-b-[1px] active:mt-[2px] transition-all"
            >
              <Icon name="menu_book" size={16} />
              単語帳を見る
            </Link>
          </section>
        ) : (
          <>
            {/* Tabs */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1">表示モード</h2>
              <div className="grid grid-cols-3 gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 border-b-4 transition-all ${
                      activeTab === tab.id
                        ? 'bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning)]/30'
                        : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)] active:border-b-2 active:mt-[2px]'
                    }`}
                  >
                    <Icon name={tab.icon} size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Study Tab */}
            {activeTab === 'study' && firstProjectId && (
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-[var(--color-foreground)] px-1">学習モード</h3>
                <div className="grid grid-cols-2 gap-4">
                  <StudyModeCard
                    title="苦手クイズ"
                    description="苦手な単語を復習"
                    icon="menu_book"
                    href={isPro ? `/quiz/all/favorites?from=${returnPath}` : '/subscription'}
                    variant="primary"
                    badge={!isPro ? 'Pro' : undefined}
                    layout="vertical"
                    styleMode="home"
                  />
                  <StudyModeCard
                    title="苦手カード"
                    description="スワイプで確認"
                    icon="style"
                    href={isPro ? `/flashcard/all?favorites=true&from=${returnPath}` : '/subscription'}
                    variant="blue"
                    badge={!isPro ? 'Pro' : undefined}
                    layout="vertical"
                    styleMode="home"
                  />
                </div>
              </section>
            )}

            {/* Words Tab */}
            {activeTab === 'words' && (
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-[var(--color-foreground)] px-1">単語一覧</h3>
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
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-[var(--color-foreground)] px-1">統計</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="card p-4 lg:p-5 border-2 border-[var(--color-border)] border-b-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-warning-light)] flex items-center justify-center mb-3">
                      <Icon name="flag" size={20} className="text-[var(--color-warning)]" />
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">苦手単語</p>
                    <p className="text-2xl font-bold text-[var(--color-warning)] mt-1">{stats.total}</p>
                  </div>
                  <div className="card p-4 lg:p-5 border-2 border-[var(--color-border)] border-b-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-success-light)] flex items-center justify-center mb-3">
                      <Icon name="check_circle" size={20} className="text-[var(--color-success)]" />
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">習得済み</p>
                    <p className="text-2xl font-bold text-[var(--color-foreground)] mt-1">{stats.mastered}</p>
                  </div>
                  <div className="card p-4 lg:p-5 border-2 border-[var(--color-border)] border-b-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center mb-3">
                      <Icon name="schedule" size={20} className="text-[var(--color-primary)]" />
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">復習中</p>
                    <p className="text-2xl font-bold text-[var(--color-foreground)] mt-1">{stats.review}</p>
                  </div>
                  <div className="card p-4 lg:p-5 border-2 border-[var(--color-border)] border-b-4">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-alt,var(--color-border-light))] flex items-center justify-center mb-3">
                      <Icon name="fiber_new" size={20} className="text-[var(--color-muted)]" />
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">未学習</p>
                    <p className="text-2xl font-bold text-[var(--color-foreground)] mt-1">{stats.newWords}</p>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
    </>
  );
}
