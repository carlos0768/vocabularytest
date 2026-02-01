'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Play, Layers, BookText, BarChart3, Lock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { BottomNav } from '@/components/ui/bottom-nav';
import { StudyModeCard } from '@/components/home/StudyModeCard';
import { getRepository } from '@/lib/db';
import { useAuth } from '@/hooks/use-auth';
import type { Project, Word, SubscriptionStatus } from '@/types';

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, loading: authLoading } = useAuth();
  
  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('study');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const isPro = subscriptionStatus === 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  useEffect(() => {
    if (authLoading) return;

    const loadData = async () => {
      try {
        const [projectData, wordsData] = await Promise.all([
          repository.getProject(projectId),
          repository.getWords(projectId),
        ]);
        
        if (!projectData) {
          router.push('/');
          return;
        }
        
        setProject(projectData);
        setWords(wordsData);
      } catch (error) {
        console.error('Failed to load project:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [authLoading, projectId, repository, router]);

  const filteredWords = useMemo(() => {
    let result = words;
    
    if (showFavoritesOnly) {
      result = result.filter(w => w.isFavorite);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(w => 
        w.english.toLowerCase().includes(query) ||
        w.japanese.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [words, searchQuery, showFavoritesOnly]);

  const stats = useMemo(() => {
    const total = words.length;
    const mastered = words.filter(w => w.status === 'mastered').length;
    const review = words.filter(w => w.status === 'review').length;
    const newWords = words.filter(w => w.status === 'new').length;
    const favorites = words.filter(w => w.isFavorite).length;
    
    return { total, mastered, review, newWords, favorites };
  }, [words]);

  const tabs = [
    { id: 'study', label: '学習' },
    { id: 'words', label: '単語' },
    { id: 'stats', label: '統計', icon: isPro ? undefined : <Lock className="w-3 h-3" /> },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 backdrop-blur-sm border-b border-[var(--color-border)]">
        <div className="max-w-lg mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--color-muted)]" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-[var(--color-foreground)] truncate">
                {project.title}
              </h1>
              <p className="text-sm text-[var(--color-muted)]">
                {stats.total}語 • {Math.round(stats.mastered / stats.total * 100) || 0}%習得
              </p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </header>

      {/* Tab content */}
      <main className="max-w-lg mx-auto px-6 py-4">
        {/* Study Tab */}
        <TabPanel id="study" activeTab={activeTab}>
          <div className="space-y-4">
            {/* Progress summary */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[var(--color-foreground)]">学習進捗</span>
                <span className="text-sm text-[var(--color-muted)]">{stats.mastered}/{stats.total}</span>
              </div>
              <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-peach)] rounded-full transition-all"
                  style={{ width: `${Math.round(stats.mastered / stats.total * 100) || 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-[var(--color-muted)]">
                <span>新規: {stats.newWords}</span>
                <span>復習: {stats.review}</span>
                <span>習得: {stats.mastered}</span>
              </div>
            </div>

            {/* Study mode cards */}
            <div className="grid grid-cols-2 gap-4">
              <StudyModeCard
                title="クイズ"
                description="4択単語テスト"
                icon={Play}
                href={`/quiz/${projectId}`}
                variant="red"
                disabled={words.length === 0}
              />
              <StudyModeCard
                title="カード"
                description="フラッシュカード"
                icon={Layers}
                href={isPro ? `/flashcard/${projectId}` : '/subscription'}
                variant="blue"
                disabled={words.length === 0}
                badge={!isPro ? 'Pro' : undefined}
              />
            </div>

            {/* Sentence quiz - full width */}
            <StudyModeCard
              title="例文クイズ"
              description="例文で単語を覚える"
              icon={BookText}
              href={isPro ? `/sentence-quiz/${projectId}` : '/subscription'}
              variant="green"
              disabled={words.length === 0}
              badge={!isPro ? 'Pro' : undefined}
            />

            {/* Favorites quiz if any */}
            {stats.favorites > 0 && (
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-[var(--color-foreground)]">苦手な単語</h3>
                    <p className="text-sm text-[var(--color-muted)]">{stats.favorites}語を復習</p>
                  </div>
                  <Button
                    onClick={() => router.push(`/quiz/${projectId}/favorites`)}
                    size="sm"
                  >
                    復習する
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabPanel>

        {/* Words Tab */}
        <TabPanel id="words" activeTab={activeTab}>
          <div className="space-y-4">
            {/* Search and filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)]" />
                <input
                  type="text"
                  placeholder="単語を検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                />
              </div>
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  showFavoritesOnly
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)]'
                }`}
              >
                苦手
              </button>
            </div>

            {/* Simple word list */}
            {filteredWords.length === 0 ? (
              <div className="text-center py-8 text-[var(--color-muted)]">
                {searchQuery || showFavoritesOnly ? '該当する単語がありません' : '単語がありません'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredWords.map((word) => (
                  <div
                    key={word.id}
                    className="card p-3 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--color-foreground)] truncate">{word.english}</p>
                      <p className="text-sm text-[var(--color-muted)] truncate">{word.japanese}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {word.isFavorite && (
                        <span className="text-xs bg-[var(--color-error-light)] text-[var(--color-error)] px-2 py-0.5 rounded-full">
                          苦手
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        word.status === 'mastered'
                          ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                          : word.status === 'review'
                          ? 'bg-[var(--color-peach-light)] text-[var(--color-peach)]'
                          : 'bg-gray-100 dark:bg-gray-800 text-[var(--color-muted)]'
                      }`}>
                        {word.status === 'mastered' ? '習得' : word.status === 'review' ? '復習' : '新規'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabPanel>

        {/* Stats Tab */}
        <TabPanel id="stats" activeTab={activeTab}>
          {isPro ? (
            <div className="space-y-4">
              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-4 text-center">
                  <p className="text-3xl font-bold text-[var(--color-primary)]">{stats.total}</p>
                  <p className="text-sm text-[var(--color-muted)]">総単語数</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-bold text-[var(--color-success)]">{stats.mastered}</p>
                  <p className="text-sm text-[var(--color-muted)]">習得済み</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-bold text-[var(--color-peach)]">{stats.review}</p>
                  <p className="text-sm text-[var(--color-muted)]">復習中</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-bold text-[var(--color-error)]">{stats.favorites}</p>
                  <p className="text-sm text-[var(--color-muted)]">苦手</p>
                </div>
              </div>

              {/* Progress breakdown */}
              <div className="card p-4">
                <h3 className="font-semibold text-[var(--color-foreground)] mb-4">ステータス内訳</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-muted)]">新規</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gray-400 rounded-full"
                          style={{ width: `${(stats.newWords / stats.total * 100) || 0}%` }}
                        />
                      </div>
                      <span className="text-sm text-[var(--color-foreground)] w-12 text-right">{stats.newWords}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-muted)]">復習中</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[var(--color-peach)] rounded-full"
                          style={{ width: `${(stats.review / stats.total * 100) || 0}%` }}
                        />
                      </div>
                      <span className="text-sm text-[var(--color-foreground)] w-12 text-right">{stats.review}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-muted)]">習得</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[var(--color-success)] rounded-full"
                          style={{ width: `${(stats.mastered / stats.total * 100) || 0}%` }}
                        />
                      </div>
                      <span className="text-sm text-[var(--color-foreground)] w-12 text-right">{stats.mastered}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-10 h-10 text-[var(--color-primary)]" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
                統計機能はPro限定
              </h2>
              <p className="text-[var(--color-muted)] mb-6">
                詳細な学習統計でより効率的に学習しましょう
              </p>
              <Button onClick={() => router.push('/subscription')}>
                Proにアップグレード
              </Button>
            </div>
          )}
        </TabPanel>
      </main>

      <BottomNav />
    </div>
  );
}
