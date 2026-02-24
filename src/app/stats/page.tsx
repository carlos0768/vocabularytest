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
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1 flex items-center gap-2">
                  <Icon name="today" size={18} className="text-[var(--color-primary)]" />
                  今日の学習
                </h2>
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
              </section>

              {/* 今週の学習 */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1 flex items-center gap-2">
                  <Icon name="date_range" size={18} className="text-[var(--color-primary)]" />
                  今週の学習
                </h2>
                <div className="card p-5 lg:p-6 border-2 border-[var(--color-border)] border-b-4">
                  {/* Bar chart */}
                  <div className="flex items-end justify-between gap-1.5 h-28 mb-3">
                    {stats.weeklyStats.map((day, i) => {
                      const maxCount = Math.max(...stats.weeklyStats.map(d => d.totalCount), 1);
                      const heightPct = day.totalCount > 0 ? Math.max((day.totalCount / maxCount) * 100, 8) : 0;
                      const isToday = i === stats.weeklyStats.length - 1;
                      const dayLabel = ['日', '月', '火', '水', '木', '金', '土'][new Date(day.date).getDay()];
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-bold text-[var(--color-muted)]">
                            {day.totalCount > 0 ? day.totalCount : ''}
                          </span>
                          <div className="w-full flex items-end" style={{ height: '80px' }}>
                            <div
                              className={`w-full rounded-t-md transition-all duration-500 ${
                                isToday
                                  ? 'bg-[var(--color-primary)]'
                                  : day.totalCount > 0
                                    ? 'bg-[var(--color-border)]'
                                    : 'bg-[var(--color-border-light)]'
                              }`}
                              style={{
                                height: day.totalCount > 0 ? `${heightPct}%` : '4px',
                                minHeight: day.totalCount > 0 ? '6px' : '4px',
                              }}
                            />
                          </div>
                          <span className={`text-[10px] font-semibold ${
                            isToday ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'
                          }`}>
                            {dayLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Accuracy row */}
                  <div className="flex justify-between gap-1.5 pt-2 border-t border-[var(--color-border-light)]">
                    {stats.weeklyStats.map((day, i) => {
                      const acc = day.totalCount > 0 ? Math.round((day.correctCount / day.totalCount) * 100) : -1;
                      const isToday = i === stats.weeklyStats.length - 1;
                      return (
                        <div key={day.date} className="flex-1 text-center">
                          <span className={`text-[10px] font-semibold ${
                            acc < 0
                              ? 'text-[var(--color-muted)]'
                              : isToday
                                ? 'text-[var(--color-primary)]'
                                : acc >= 80
                                  ? 'text-[var(--color-success)]'
                                  : 'text-[var(--color-foreground)]'
                          }`}>
                            {acc < 0 ? '-' : `${acc}%`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] text-right mt-1">正答率</p>
                </div>

                {/* Weekly summary */}
                {(() => {
                  const weekTotal = stats.weeklyStats.reduce((s, d) => s + d.totalCount, 0);
                  const weekCorrect = stats.weeklyStats.reduce((s, d) => s + d.correctCount, 0);
                  const weekAcc = weekTotal > 0 ? Math.round((weekCorrect / weekTotal) * 100) : 0;
                  const activeDays = stats.weeklyStats.filter(d => d.totalCount > 0).length;
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="card p-3 text-center border-2 border-[var(--color-border)] border-b-4">
                        <p className="text-xl font-bold text-[var(--color-foreground)]">{weekTotal}</p>
                        <p className="text-[10px] font-semibold text-[var(--color-muted)]">週間回答数</p>
                      </div>
                      <div className="card p-3 text-center border-2 border-[var(--color-border)] border-b-4">
                        <p className="text-xl font-bold text-[var(--color-success)]">{weekAcc}%</p>
                        <p className="text-[10px] font-semibold text-[var(--color-muted)]">週間正答率</p>
                      </div>
                      <div className="card p-3 text-center border-2 border-[var(--color-border)] border-b-4">
                        <p className="text-xl font-bold text-[var(--color-foreground)]">{activeDays}/7</p>
                        <p className="text-[10px] font-semibold text-[var(--color-muted)]">学習日数</p>
                      </div>
                    </div>
                  );
                })()}
              </section>

              {/* 単語統計 */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1 flex items-center gap-2">
                  <Icon name="menu_book" size={18} className="text-[var(--color-primary)]" />
                  単語統計
                </h2>
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
              </section>

              {/* 概要 */}
              <section className="space-y-4">
                <h2 className="text-sm font-bold text-[var(--color-foreground)] px-1 flex items-center gap-2">
                  <Icon name="bar_chart" size={18} className="text-[var(--color-primary)]" />
                  概要
                </h2>
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
              </section>
            </div>
          )}
        </main>
      </div>
    </AppShell>
  );
}
