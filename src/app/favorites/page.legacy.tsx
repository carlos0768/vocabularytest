'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { StudyModeCard, WordList } from '@/components/home';
import { SolidEmpty, SolidHeader, SolidPage, SolidPanel, SolidSectionTitle, SolidStatCard } from '@/components/redesign/SolidPage';
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
    <SolidPage maxWidth="max-w-lg lg:max-w-2xl">
      <SolidHeader
        eyebrow="FAVORITES"
        title="苦手単語"
        description={`${stats.total}語を復習リストに保存中。クイズとカードで弱い単語だけを集中的に見直します。`}
        backHref="/"
      />
        {favorites.length === 0 ? (
          <SolidEmpty
            icon="flag"
            title="苦手単語はまだありません"
            description="クイズや単語一覧のフラグを使って、後で見直したい単語をまとめましょう。"
            action={
            <Link
              href="/projects"
              className="solid-link-primary"
            >
              <Icon name="menu_book" size={16} />
              単語帳を見る
            </Link>
            }
          />
        ) : (
          <>
            {/* Tabs */}
            <SolidPanel className="space-y-3 p-4">
              <SolidSectionTitle icon="view_week" title="表示モード" />
              <div className="grid grid-cols-3 gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] px-3 py-2.5 text-sm font-black transition-all ${
                      activeTab === tab.id
                        ? 'border-[var(--solid-ink)] bg-[var(--color-foreground)] text-white'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
                    }`}
                  >
                    <Icon name={tab.icon} size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </SolidPanel>

            {/* Study Tab */}
            {activeTab === 'study' && firstProjectId && (
              <section className="space-y-4">
                <SolidSectionTitle icon="school" title="学習モード" />
                <div className="grid grid-cols-2 gap-4">
                  <StudyModeCard
                    title="苦手クイズ"
                    description="苦手な単語を復習"
                    icon="menu_book"
                    href={isPro ? `/quiz/all?favorites=true&from=${returnPath}` : '/subscription'}
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
                <SolidSectionTitle icon="menu_book" title="単語一覧" count={`${favorites.length}語`} />
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
                <SolidSectionTitle icon="insights" title="統計" />
                <div className="grid grid-cols-2 gap-3">
                  <SolidStatCard icon="flag" label="苦手単語" value={stats.total} tone="warning" />
                  <SolidStatCard icon="check_circle" label="習得済み" value={stats.mastered} tone="success" />
                  <SolidStatCard icon="schedule" label="復習中" value={stats.review} />
                  <SolidStatCard icon="fiber_new" label="未学習" value={stats.newWords} />
                </div>
              </section>
            )}
          </>
        )}
      </SolidPage>
    </>
  );
}
