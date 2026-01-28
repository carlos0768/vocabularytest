'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart3, TrendingUp, Target, Calendar, BookOpen, CheckCircle2, Flame } from 'lucide-react';
import { BottomNav } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { getDailyStats, getWrongAnswers, getGuestUserId, getActivityHistory, getStreakDays } from '@/lib/utils';
import type { DailyActivity } from '@/lib/utils';
import type { Project, Word } from '@/types';

interface Stats {
  totalProjects: number;
  totalWords: number;
  masteredWords: number;
  reviewWords: number;
  newWords: number;
  favoriteWords: number;
  wrongAnswersCount: number;
  quizStats: {
    todayCount: number;
    correctCount: number;
    streakDays: number;
    lastQuizDate: string | null;
  };
}

// Activity Heatmap Component (GitHub-style: rows = days of week, columns = weeks)
function ActivityHeatmap({ activityHistory }: { activityHistory: DailyActivity[] }) {
  // Organize data into a grid: rows = days of week (0=Sun, 6=Sat), columns = weeks
  const { grid, weekLabels } = useMemo(() => {
    // Initialize 7 rows (one for each day of week)
    const rows: (DailyActivity | null)[][] = Array.from({ length: 7 }, () => []);
    const labels: string[] = [];

    // Find the first Sunday to start the grid alignment
    let currentWeek = 0;
    let lastDayOfWeek = -1;

    activityHistory.forEach((day, index) => {
      const date = new Date(day.date);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

      // Start a new week when we encounter a Sunday after having other days
      if (dayOfWeek === 0 && index > 0) {
        currentWeek++;
        // Add week label (first day of the week)
        labels[currentWeek] = `${date.getMonth() + 1}/${date.getDate()}`;
      }

      // Initialize first week label
      if (index === 0) {
        labels[0] = `${date.getMonth() + 1}/${date.getDate()}`;
      }

      // Ensure all rows have enough columns
      while (rows[dayOfWeek].length <= currentWeek) {
        for (let i = 0; i < 7; i++) {
          if (rows[i].length <= currentWeek) {
            rows[i].push(null);
          }
        }
      }

      rows[dayOfWeek][currentWeek] = day;
      lastDayOfWeek = dayOfWeek;
    });

    return { grid: rows, weekLabels: labels };
  }, [activityHistory]);

  // Get intensity level (0-4) based on quiz count
  const getIntensity = (count: number): number => {
    if (count === 0) return 0;
    if (count <= 5) return 1;
    if (count <= 15) return 2;
    if (count <= 30) return 3;
    return 4;
  };

  // Color classes based on intensity
  const getColorClass = (intensity: number): string => {
    switch (intensity) {
      case 0: return 'bg-[var(--color-surface)]';
      case 1: return 'bg-[var(--color-peach-light)]';
      case 2: return 'bg-[var(--color-peach)]';
      case 3: return 'bg-[var(--color-primary)]/70';
      case 4: return 'bg-[var(--color-primary)]';
      default: return 'bg-[var(--color-surface)]';
    }
  };

  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

  // Format date for tooltip
  const formatTooltipDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const numWeeks = grid[0]?.length || 0;

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-[var(--color-primary)]" />
        学習カレンダー
      </h2>

      <div className="flex gap-2">
        {/* Day labels (vertical, left side) */}
        <div className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
          {dayLabels.map((day, i) => (
            <div key={i} className="h-3 w-4 flex items-center justify-end">
              {i % 2 === 1 ? day : ''}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex flex-col gap-1 min-w-fit">
            {/* Grid: each row is a day of week */}
            {grid.map((row, dayIndex) => (
              <div key={dayIndex} className="flex gap-1">
                {row.map((day, weekIndex) => {
                  if (!day) {
                    return (
                      <div
                        key={weekIndex}
                        className="w-3 h-3 rounded-sm bg-transparent"
                      />
                    );
                  }
                  const intensity = getIntensity(day.quizCount);
                  const isToday = day.date === new Date().toISOString().split('T')[0];
                  return (
                    <div
                      key={weekIndex}
                      className={`w-3 h-3 rounded-sm ${getColorClass(intensity)} ${
                        isToday ? 'ring-1 ring-[var(--color-primary)] ring-offset-1' : ''
                      } transition-colors cursor-default`}
                      title={`${formatTooltipDate(day.date)}: ${day.quizCount}問`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-3 text-xs text-[var(--color-muted)]">
        <span>少</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={`w-3 h-3 rounded-sm ${getColorClass(level)}`}
            />
          ))}
        </div>
        <span>多</span>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activityHistory, setActivityHistory] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      if (authLoading) return;

      try {
        const repository = getRepository(subscription?.status ?? 'free');
        const userId = isPro && user ? user.id : getGuestUserId();
        const projects = await repository.getProjects(userId);

        let totalWords = 0;
        let masteredWords = 0;
        let reviewWords = 0;
        let newWords = 0;
        let favoriteWords = 0;

        for (const project of projects) {
          const words = await repository.getWords(project.id);
          totalWords += words.length;

          for (const word of words) {
            if (word.status === 'mastered') masteredWords++;
            else if (word.status === 'review') reviewWords++;
            else newWords++;

            if (word.isFavorite) favoriteWords++;
          }
        }

        const dailyStats = getDailyStats();
        const wrongAnswers = getWrongAnswers();
        const streakDays = getStreakDays();
        const history = getActivityHistory(4); // 4 weeks

        setActivityHistory(history);
        setStats({
          totalProjects: projects.length,
          totalWords,
          masteredWords,
          reviewWords,
          newWords,
          favoriteWords,
          wrongAnswersCount: wrongAnswers.length,
          quizStats: {
            todayCount: dailyStats.todayCount,
            correctCount: dailyStats.correctCount,
            streakDays,
            lastQuizDate: null,
          },
        });
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [subscription?.status, authLoading, isPro, user]);

  const masteryPercentage = stats && stats.totalWords > 0
    ? Math.round((stats.masteredWords / stats.totalWords) * 100)
    : 0;

  const accuracyPercentage = stats && stats.quizStats.todayCount > 0
    ? Math.round((stats.quizStats.correctCount / stats.quizStats.todayCount) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 backdrop-blur-sm z-40 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">統計</h1>
        </div>
      </header>

      <main className="px-6 max-w-lg mx-auto">
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
            {/* Activity Heatmap - GitHub草風 */}
            <ActivityHeatmap activityHistory={activityHistory} />

            {/* Today's Progress */}
            <div className="card p-5">
              <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[var(--color-primary)]" />
                今日の学習
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[var(--color-peach-light)] rounded-2xl p-4">
                  <p className="text-sm text-[var(--color-muted)]">クイズ回答数</p>
                  <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.quizStats.todayCount}</p>
                </div>
                <div className="bg-[var(--color-success-light)] rounded-2xl p-4">
                  <p className="text-sm text-[var(--color-muted)]">正答率</p>
                  <p className="text-2xl font-bold text-[var(--color-success)]">{accuracyPercentage}%</p>
                </div>
              </div>
            </div>

            {/* Word Statistics */}
            <div className="card p-5">
              <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
                単語統計
              </h2>

              {/* Mastery Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[var(--color-muted)]">習得率</span>
                  <span className="font-semibold text-[var(--color-foreground)]">{masteryPercentage}%</span>
                </div>
                <div className="h-3 bg-[var(--color-peach-light)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-peach)] rounded-full transition-all duration-500"
                    style={{ width: `${masteryPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-[var(--color-success-light)] rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-[var(--color-success)] mx-auto mb-1" />
                  <p className="text-lg font-bold text-[var(--color-foreground)]">{stats.masteredWords}</p>
                  <p className="text-xs text-[var(--color-muted)]">習得済み</p>
                </div>
                <div className="text-center p-3 bg-[var(--color-peach-light)] rounded-xl">
                  <Target className="w-5 h-5 text-[var(--color-peach)] mx-auto mb-1" />
                  <p className="text-lg font-bold text-[var(--color-foreground)]">{stats.reviewWords}</p>
                  <p className="text-xs text-[var(--color-muted)]">復習中</p>
                </div>
                <div className="text-center p-3 bg-[var(--color-surface)] rounded-xl">
                  <TrendingUp className="w-5 h-5 text-[var(--color-muted)] mx-auto mb-1" />
                  <p className="text-lg font-bold text-[var(--color-foreground)]">{stats.newWords}</p>
                  <p className="text-xs text-[var(--color-muted)]">未学習</p>
                </div>
              </div>
            </div>

            {/* Overview */}
            <div className="card p-5">
              <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" />
                概要
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-[var(--color-muted)]">プロジェクト数</span>
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

      <BottomNav />
    </div>
  );
}
