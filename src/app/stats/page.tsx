'use client';

import { useState, useEffect } from 'react';
import { AppShell, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getCachedStats, getStats, type CachedStats } from '@/lib/stats-cache';

export default function StatsPage() {
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const [stats, setStats] = useState<CachedStats | null>(() => getCachedStats());
  const [loading, setLoading] = useState(!stats);

  useEffect(() => {
    if (authLoading) return;

    const subscriptionStatus = subscription?.status ?? 'free';
    getStats(subscriptionStatus, user?.id ?? null, isPro)
      .then((freshStats) => {
        setStats(freshStats);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load stats:', error);
        setLoading(false);
      });
  }, [subscription?.status, authLoading, isPro, user]);

  const masteryPercentage = stats && stats.totalWords > 0
    ? Math.round((stats.masteredWords / stats.totalWords) * 100)
    : 0;

  const accuracyPercentage = stats && stats.quizStats.todayCount > 0
    ? Math.round((stats.quizStats.correctCount / stats.quizStats.todayCount) * 100)
    : 0;

  return (
    <AppShell>
      <div className="pb-24 lg:pb-8">
        <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
          <div className="max-w-lg lg:max-w-5xl mx-auto">
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">統計</h1>
          </div>
        </header>

        <main className="px-6 max-w-lg lg:max-w-5xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !stats ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-muted)]">統計を読み込めませんでした</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="card p-5">
                <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                  <Icon name="today" size={20} className="text-[var(--color-primary)]" />
                  今日の学習
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[var(--color-primary-light)] rounded-2xl p-4">
                    <p className="text-sm text-[var(--color-muted)]">クイズ回答数</p>
                    <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.quizStats.todayCount}</p>
                  </div>
                  <div className="bg-[var(--color-success-light)] rounded-2xl p-4">
                    <p className="text-sm text-[var(--color-muted)]">正答率</p>
                    <p className="text-2xl font-bold text-[var(--color-success)]">{accuracyPercentage}%</p>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                  <Icon name="menu_book" size={20} className="text-[var(--color-primary)]" />
                  単語統計
                </h2>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-[var(--color-muted)]">習得率</span>
                    <span className="font-semibold text-[var(--color-foreground)]">{masteryPercentage}%</span>
                  </div>
                  <div className="h-3 bg-[var(--color-primary-light)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${masteryPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-[var(--color-success-light)] rounded-xl">
                    <Icon name="check_circle" size={20} className="text-[var(--color-success)] mx-auto mb-1" />
                    <p className="text-lg font-bold text-[var(--color-foreground)]">{stats.masteredWords}</p>
                    <p className="text-xs text-[var(--color-muted)]">習得済み</p>
                  </div>
                  <div className="text-center p-3 bg-[var(--color-primary-light)] rounded-xl">
                    <Icon name="target" size={20} className="text-[var(--color-primary)] mx-auto mb-1" />
                    <p className="text-lg font-bold text-[var(--color-foreground)]">{stats.reviewWords}</p>
                    <p className="text-xs text-[var(--color-muted)]">復習中</p>
                  </div>
                  <div className="text-center p-3 bg-[var(--color-surface)] rounded-xl">
                    <Icon name="trending_up" size={20} className="text-[var(--color-muted)] mx-auto mb-1" />
                    <p className="text-lg font-bold text-[var(--color-foreground)]">{stats.newWords}</p>
                    <p className="text-xs text-[var(--color-muted)]">未学習</p>
                  </div>
                </div>
              </div>

              <div className="card p-5">
                <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                  <Icon name="bar_chart" size={20} className="text-[var(--color-primary)]" />
                  概要
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                    <span className="text-[var(--color-muted)]">単語帳数</span>
                    <span className="font-semibold text-[var(--color-foreground)]">{stats.totalProjects}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                    <span className="text-[var(--color-muted)]">総単語数</span>
                    <span className="font-semibold text-[var(--color-foreground)]">{stats.totalWords}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                    <span className="text-[var(--color-muted)]">苦手単語</span>
                    <span className="font-semibold text-[var(--color-foreground)]">{stats.favoriteWords}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-[var(--color-muted)]">間違えた単語</span>
                    <span className="font-semibold text-[var(--color-error)]">{stats.wrongAnswersCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
