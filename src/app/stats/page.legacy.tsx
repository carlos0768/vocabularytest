'use client';

import { useState, useEffect, useMemo } from 'react';
import { SolidHeader, SolidPage, SolidPanel, SolidSectionTitle, SolidStatCard } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { getStats, type CachedStats } from '@/lib/stats-cache';

type StatsLoadState = {
  authKey: string;
  stats: CachedStats | null;
};

export default function StatsPage() {
  const { user, subscription, isPro, wasPro, loading: authLoading } = useAuth();
  const authStatsKey = authLoading ? null : user?.id ?? 'guest';
  const [statsState, setStatsState] = useState<StatsLoadState | null>(null);
  const stats = statsState?.authKey === authStatsKey ? statsState.stats : null;
  const loading = authLoading || (authStatsKey !== null && statsState?.authKey !== authStatsKey);

  useEffect(() => {
    if (authLoading || !authStatsKey) return;

    let cancelled = false;
    const subscriptionStatus = subscription?.status ?? 'free';

    getStats(subscriptionStatus, user?.id ?? null, isPro, wasPro)
      .then((freshStats) => {
        if (cancelled) return;
        setStatsState({ authKey: authStatsKey, stats: freshStats });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load stats:', error);
        setStatsState({ authKey: authStatsKey, stats: null });
      });

    return () => {
      cancelled = true;
    };
  }, [subscription?.status, authLoading, authStatsKey, isPro, user?.id, wasPro]);

  const masteryPercentage = stats && stats.totalWords > 0
    ? Math.round((stats.masteredWords / stats.totalWords) * 100)
    : 0;

  const recentWeeklyStats = useMemo(() => {
    if (!stats?.weeklyStats) return [];
    return stats.weeklyStats.slice(-7);
  }, [stats]);

  const chartMaxMastered = useMemo(() => {
    if (recentWeeklyStats.length === 0) return 10;
    const maxMastered = Math.max(...recentWeeklyStats.map(d => d.masteredCount ?? 0));
    return Math.max(maxMastered, 10);
  }, [recentWeeklyStats]);

  return (
    <>
      <SolidPage maxWidth="max-w-lg lg:max-w-3xl">
        <SolidHeader
          eyebrow="PROGRESS"
          title="進歩"
          description="毎日の正解数、単語の習得率、復習量をまとめて確認します。"
        />
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
                <SolidStatCard icon="local_fire_department" label="連続学習" value={stats.quizStats.streakDays} suffix="日" tone="warning" />
                <SolidStatCard icon="auto_awesome" label="今日正解" value={stats.quizStats.correctCount ?? 0} suffix="語" tone="success" />
              </div>

              {/* Mastered words chart - iOS style */}
              <SolidPanel className="p-5">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-sm font-bold text-[var(--color-foreground)]">暗記した単語数の推移</p>
                  <p className="text-xs text-[var(--color-muted)]">過去7日間</p>
                </div>
                {(() => {
                  const BAR_AREA_HEIGHT = 160;
                  const formatMD = (iso: string) => {
                    const [, m, d] = iso.split('-');
                    return `${m}/${d}`;
                  };
                  return (
                    <div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {/* Y axis */}
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '36px', height: BAR_AREA_HEIGHT, flexShrink: 0, fontSize: '10px', color: 'var(--color-muted)' }}>
                          <span>{chartMaxMastered.toLocaleString()}</span>
                          <span>{Math.round(chartMaxMastered / 2).toLocaleString()}</span>
                          <span>0</span>
                        </div>
                        {/* Bars */}
                        <div style={{ flex: 1, position: 'relative', height: BAR_AREA_HEIGHT }}>
                          {/* Grid lines */}
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                            <div style={{ borderTop: '1px dashed var(--color-border)' }} />
                            <div style={{ borderTop: '1px dashed var(--color-border)' }} />
                            <div style={{ borderTop: '1px solid var(--color-border)' }} />
                          </div>
                          {/* Bar items */}
                          <div style={{
                            position: 'absolute', inset: 0,
                            display: 'grid',
                            gridTemplateColumns: `repeat(${recentWeeklyStats.length}, 1fr)`,
                            columnGap: '4px',
                            alignItems: 'end',
                          }}>
                            {recentWeeklyStats.map((day) => {
                              const mastered = day.masteredCount ?? 0;
                              const barHeight = mastered > 0
                                ? Math.max(Math.round((mastered / chartMaxMastered) * BAR_AREA_HEIGHT), 4)
                                : 2;
                              return (
                                <div
                                  key={day.date}
                                  style={{
                                    height: `${barHeight}px`,
                                    backgroundColor: mastered > 0 ? 'var(--color-success)' : 'var(--color-border-light)',
                                    borderRadius: '2px 2px 0 0',
                                    transition: 'height 0.5s ease',
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      {/* X axis labels — one cell per bar, show all dates */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${recentWeeklyStats.length}, 1fr)`,
                        columnGap: '4px',
                        marginTop: '4px',
                        marginLeft: '40px',
                      }}>
                        {recentWeeklyStats.map((day) => (
                          <div key={day.date} style={{ position: 'relative', height: '12px' }}>
                            <span style={{
                              position: 'absolute',
                              left: '50%',
                              top: 0,
                              transform: 'translateX(-50%)',
                              fontSize: '10px',
                              color: 'var(--color-muted)',
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}>
                              {formatMD(day.date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 ml-12">
                  <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                    習得済み
                  </span>
                </div>
              </SolidPanel>

              {/* Word stats section - iOS style */}
              <div>
                <SolidSectionTitle icon="description" title="単語統計" />

                <SolidPanel className="p-5">
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
                </SolidPanel>
              </div>

              {/* Summary - iOS style list */}
              <SolidPanel className="overflow-hidden p-0">
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
              </SolidPanel>

              {/* Bottom stats - total count */}
              <div className="text-center text-xs text-[var(--color-muted)] pb-4">
                {stats.totalWords.toLocaleString()}語中 / 復習中 {stats.reviewWords.toLocaleString()}語
              </div>
            </div>
          )}
      </SolidPage>
    </>
  );
}
