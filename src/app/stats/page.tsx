'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppShell, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getCachedStats, getStats, type CachedStats } from '@/lib/stats-cache';

export default function StatsPage() {
  const { user, subscription, isPro, wasPro, loading: authLoading } = useAuth();

  const [stats, setStats] = useState<CachedStats | null>(() => getCachedStats());
  const [loading, setLoading] = useState(!stats);

  useEffect(() => {
    if (authLoading) return;

    const subscriptionStatus = subscription?.status ?? 'free';
    getStats(subscriptionStatus, user?.id ?? null, isPro, wasPro)
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

  const chartDates = useMemo(() => {
    if (!stats?.weeklyStats) return [];
    const dates: string[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`);
    }
    return dates;
  }, [stats]);

  const chartMaxMastered = useMemo(() => {
    if (!stats) return 100;
    return Math.max(stats.masteredWords, stats.totalWords, 100);
  }, [stats]);

  return (
    <AppShell>
      <div className="min-h-screen pb-24 lg:pb-6">
        {/* iOS-style header */}
        <header className="px-5 pt-6 pb-4">
          <div className="max-w-lg mx-auto">
            <h1 className="text-3xl font-black text-[var(--color-foreground)]">進歩</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-5 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-[var(--color-foreground)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !stats ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-muted)]">統計を読み込めませんでした</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Streak + Today mastered - iOS style 2-column cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="card p-5">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center mb-3">
                    <Icon name="local_fire_department" size={22} className="text-orange-500" filled />
                  </div>
                  <p className="text-3xl font-black text-[var(--color-foreground)]">{stats.quizStats.streakDays}<span className="text-lg font-bold">日</span></p>
                  <p className="text-sm font-bold text-[var(--color-foreground)] mt-1">連続学習</p>
                  <p className="text-xs text-[var(--color-muted)]">学習を継続中</p>
                </div>
                <div className="card p-5">
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-3">
                    <Icon name="auto_awesome" size={22} className="text-green-600" />
                  </div>
                  <p className="text-3xl font-black text-[var(--color-foreground)]">{stats.quizStats.correctCount ?? 0}<span className="text-lg font-bold">語</span></p>
                  <p className="text-sm font-bold text-[var(--color-foreground)] mt-1">今日正解</p>
                  <p className="text-xs text-[var(--color-muted)]">今日の正解数</p>
                </div>
              </div>

              {/* Mastered words chart - iOS style */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-sm font-bold text-[var(--color-foreground)]">暗記した単語数の推移</p>
                  <p className="text-xs text-[var(--color-muted)]">過去14日間</p>
                </div>
                <div className="relative h-48">
                  {/* Y axis labels */}
                  <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] text-[var(--color-muted)] w-10">
                    <span>{chartMaxMastered.toLocaleString()}</span>
                    <span>{Math.round(chartMaxMastered / 2).toLocaleString()}</span>
                    <span>0</span>
                  </div>
                  {/* Chart area */}
                  <div className="ml-12 h-full relative">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ bottom: '24px' }}>
                      <div className="border-t border-dashed border-[var(--color-border)]" />
                      <div className="border-t border-dashed border-[var(--color-border)]" />
                      <div className="border-t border-[var(--color-border)]" />
                    </div>
                    {/* Bars */}
                    <div className="absolute left-0 right-0 bottom-6 flex items-end justify-between gap-1" style={{ top: 0 }}>
                      {stats.weeklyStats.map((day, i) => {
                        const maxCount = Math.max(...stats.weeklyStats.map(d => d.totalCount), 1);
                        const heightPct = day.totalCount > 0 ? Math.max((day.totalCount / maxCount) * 100, 5) : 0;
                        return (
                          <div key={day.date} className="flex-1 flex items-end h-full">
                            <div
                              className={`w-full rounded-t-sm transition-all duration-500 ${
                                day.totalCount > 0
                                  ? 'bg-[var(--color-success)]'
                                  : 'bg-[var(--color-border-light)]'
                              }`}
                              style={{
                                height: day.totalCount > 0 ? `${heightPct}%` : '2px',
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {/* X axis labels */}
                    <div className="absolute bottom-0 left-0 right-0 flex justify-between">
                      {chartDates.filter((_, i) => i % 3 === 0 || i === chartDates.length - 1).map((label) => (
                        <span key={label} className="text-[10px] text-[var(--color-muted)]">{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 ml-12">
                  <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                    習得済み
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-border)]" />
                    総単語数
                  </span>
                </div>
              </div>

              {/* Word stats section - iOS style */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Icon name="description" size={20} className="text-[var(--color-muted)]" />
                  <h2 className="text-sm font-bold text-[var(--color-foreground)]">単語統計</h2>
                </div>

                <div className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[var(--color-foreground)]">習得の進捗</h3>
                    <span className="text-xs font-semibold text-[var(--color-success)]">
                      {masteryPercentage}% 習得
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[var(--color-border-light)] rounded-full overflow-hidden flex mb-4">
                    <div
                      className="bg-[var(--color-success)] transition-all duration-500"
                      style={{ width: `${masteryPercentage}%` }}
                    />
                    <div
                      className="bg-[var(--color-muted)] transition-all duration-500"
                      style={{ width: `${stats.totalWords > 0 ? (stats.reviewWords / stats.totalWords) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs text-[var(--color-muted)]">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />習得 {stats.masteredWords}</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-muted)]" />復習中 {stats.reviewWords}</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--color-border-light)]" />未学習 {stats.newWords}</span>
                  </div>
                </div>
              </div>

              {/* Summary - iOS style list */}
              <div className="card">
                <div className="flex justify-between items-center py-4 px-5 border-b border-[var(--color-border-light)]">
                  <span className="text-sm text-[var(--color-muted)]">単語帳数</span>
                  <span className="font-bold text-[var(--color-foreground)]">{stats.totalProjects}</span>
                </div>
                <div className="flex justify-between items-center py-4 px-5 border-b border-[var(--color-border-light)]">
                  <span className="text-sm text-[var(--color-muted)]">総単語数</span>
                  <span className="font-bold text-[var(--color-foreground)]">{stats.totalWords.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-4 px-5 border-b border-[var(--color-border-light)]">
                  <span className="text-sm text-[var(--color-muted)]">お気に入り単語</span>
                  <span className="font-bold text-[var(--color-foreground)]">{stats.favoriteWords}</span>
                </div>
                <div className="flex justify-between items-center py-4 px-5">
                  <span className="text-sm text-[var(--color-muted)]">連続学習日数</span>
                  <span className="font-bold text-[var(--color-foreground)]">{stats.quizStats.streakDays}日</span>
                </div>
              </div>

              {/* Bottom stats - total count */}
              <div className="text-center text-xs text-[var(--color-muted)] pb-4">
                {stats.totalWords.toLocaleString()}語中 / 復習中 {stats.reviewWords.toLocaleString()}語
              </div>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
