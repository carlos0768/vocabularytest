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
      <div className="min-h-screen pb-24 lg:pb-6">
        <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
          <div className="max-w-lg mx-auto">
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">統計</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !stats ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-muted)]">統計を読み込めませんでした</p>
            </div>
          ) : (
            <div className="space-y-10">
              {/* 今日の学習 */}
              <section>
                <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1 flex items-center gap-2 mb-4">
                  <Icon name="today" size={18} className="text-[var(--color-primary)]" />
                  今日の学習
                </h2>
                <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-light)] p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="card p-5 lg:p-6 flex flex-col gap-3 border-2 border-[var(--color-border)] border-b-4">
                      <div className="w-12 h-12 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
                        <Icon name="quiz" size={24} className="text-[var(--color-primary)]" />
                      </div>
                      <div>
                        <p className="text-3xl font-bold text-[var(--color-foreground)]">{stats.quizStats.todayCount}</p>
                        <p className="text-xs font-semibold text-[var(--color-muted)] mt-1">クイズ回答数</p>
                      </div>
                    </div>
                    <div className="card p-5 lg:p-6 flex flex-col gap-3 border-2 border-[var(--color-border)] border-b-4">
                      <div className="w-12 h-12 rounded-xl bg-[var(--color-success-light)] flex items-center justify-center shrink-0">
                        <Icon name="check_circle" size={24} className="text-[var(--color-success)]" />
                      </div>
                      <div>
                        <p className="text-3xl font-bold text-[var(--color-success)]">{accuracyPercentage}%</p>
                        <p className="text-xs font-semibold text-[var(--color-muted)] mt-1">正答率</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 単語統計 */}
              <section>
                <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1 flex items-center gap-2 mb-4">
                  <Icon name="menu_book" size={18} className="text-[var(--color-primary)]" />
                  単語統計
                </h2>
                <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-light)] p-3 space-y-3">
                  <div className="card p-5 lg:p-6 border-2 border-[var(--color-border)] border-b-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-[var(--color-foreground)]">習得の進捗</h3>
                      <span className="text-xs font-semibold text-[var(--color-success)]">
                        {masteryPercentage}% 習得
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-[var(--color-surface-alt,var(--color-border-light))] rounded-full overflow-hidden flex mb-2">
                      <div
                        className="bg-[var(--color-success)] transition-all duration-500"
                        style={{ width: `${masteryPercentage}%` }}
                      />
                      <div
                        className="bg-[var(--color-primary)] transition-all duration-500"
                        style={{ width: `${stats.totalWords > 0 ? (stats.reviewWords / stats.totalWords) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] font-semibold text-[var(--color-muted)] mt-4 px-1">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />習得 {stats.masteredWords}</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />復習中 {stats.reviewWords}</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-border-light)]" />未学習 {stats.newWords}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="card p-4 flex items-center gap-3 border-2 border-[var(--color-border)] border-b-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-success-light)] flex items-center justify-center shrink-0">
                        <Icon name="check_circle" size={20} className="text-[var(--color-success)]" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.masteredWords}</p>
                        <p className="text-xs text-[var(--color-muted)]">習得済み</p>
                      </div>
                    </div>
                    <div className="card p-4 flex items-center gap-3 border-2 border-[var(--color-border)] border-b-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
                        <Icon name="autorenew" size={20} className="text-[var(--color-primary)]" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.reviewWords}</p>
                        <p className="text-xs text-[var(--color-muted)]">復習中</p>
                      </div>
                    </div>
                    <div className="card p-4 flex items-center gap-3 border-2 border-[var(--color-border)] border-b-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center shrink-0 border border-[var(--color-border)]">
                        <Icon name="schedule" size={20} className="text-[var(--color-muted)]" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.newWords}</p>
                        <p className="text-xs text-[var(--color-muted)]">未学習</p>
                      </div>
                    </div>
                    <div className="card p-4 flex items-center gap-3 border-2 border-[var(--color-border)] border-b-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--color-error)]/10 flex items-center justify-center shrink-0">
                        <Icon name="error" size={20} className="text-[var(--color-error)]" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.wrongAnswersCount}</p>
                        <p className="text-xs text-[var(--color-muted)]">間違えた単語</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 概要 */}
              <section>
                <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1 flex items-center gap-2 mb-4">
                  <Icon name="bar_chart" size={18} className="text-[var(--color-primary)]" />
                  概要
                </h2>
                <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-light)] p-3">
                  <div className="card p-1 border-2 border-[var(--color-border)] border-b-4">
                    <div className="flex justify-between items-center py-3 px-4 border-b border-[var(--color-border-light)]">
                      <span className="text-sm text-[var(--color-muted)] font-medium">単語帳数</span>
                      <span className="font-bold text-[var(--color-foreground)]">{stats.totalProjects}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 border-b border-[var(--color-border-light)]">
                      <span className="text-sm text-[var(--color-muted)] font-medium">総単語数</span>
                      <span className="font-bold text-[var(--color-foreground)]">{stats.totalWords}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4 border-b border-[var(--color-border-light)]">
                      <span className="text-sm text-[var(--color-muted)] font-medium">お気に入り単語</span>
                      <span className="font-bold text-[var(--color-foreground)]">{stats.favoriteWords}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 px-4">
                      <span className="text-sm text-[var(--color-muted)] font-medium">連続学習日数</span>
                      <span className="font-bold text-[var(--color-foreground)]">{stats.quizStats.streakDays}日</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
