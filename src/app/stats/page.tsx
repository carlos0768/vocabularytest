'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { AppShell, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getActivityHistory } from '@/lib/utils';
import { getCachedStats, getStats, type CachedStats } from '@/lib/stats-cache';
import { createBrowserClient } from '@/lib/supabase';
import {
  buildCalendarGrid,
  calculateCalendarSummary,
  getSelectedDayDetail,
} from '@/lib/stats/calendar';
import type { DailyActivity } from '@/lib/utils';

const CALENDAR_WEEKS = 12;
const CALENDAR_DAYS = CALENDAR_WEEKS * 7;

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function ActivityHeatmap({ activityHistory }: { activityHistory: DailyActivity[] }) {
  const todayKey = toDateKey(new Date());

  const { grid, flatCells, monthLabels, summary, defaultSelectedDate } = useMemo(() => {
    const today = new Date();
    const builtGrid = buildCalendarGrid(activityHistory, CALENDAR_WEEKS, today);
    const cells = builtGrid
      .flat()
      .filter((cell) => cell.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    const builtSummary = calculateCalendarSummary(cells, todayKey);
    const latestActiveDate = [...cells].reverse().find((cell) => cell.quizCount > 0)?.date;
    const selectedDate = cells.some((cell) => cell.date === todayKey)
      ? todayKey
      : (latestActiveDate ?? cells.at(-1)?.date ?? todayKey);

    const columnStartDates: string[] = [];
    for (let weekIndex = 0; weekIndex < CALENDAR_WEEKS; weekIndex++) {
      const columnDates = builtGrid
        .map((row) => row[weekIndex]?.date ?? '')
        .filter((date) => date)
        .sort();
      columnStartDates.push(columnDates[0] ?? '');
    }

    const labels = columnStartDates.map((date, index) => {
      if (!date) return '';
      const currentMonth = new Date(`${date}T00:00:00`).getMonth();
      if (index === 0) return `${currentMonth + 1}月`;

      const previousDate = columnStartDates[index - 1];
      if (!previousDate) return '';
      const previousMonth = new Date(`${previousDate}T00:00:00`).getMonth();
      return currentMonth !== previousMonth ? `${currentMonth + 1}月` : '';
    });

    return {
      grid: builtGrid,
      flatCells: cells,
      monthLabels: labels,
      summary: builtSummary,
      defaultSelectedDate: selectedDate,
    };
  }, [activityHistory, todayKey]);

  const [selectedDate, setSelectedDate] = useState<string>(defaultSelectedDate);

  useEffect(() => {
    setSelectedDate(defaultSelectedDate);
  }, [defaultSelectedDate]);

  const selectedDetail = useMemo(
    () => getSelectedDayDetail(flatCells, selectedDate),
    [flatCells, selectedDate],
  );

  const selectedDateLabel = useMemo(() => {
    const date = new Date(`${selectedDetail.date}T00:00:00`);
    return date.toLocaleDateString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
    });
  }, [selectedDetail.date]);

  const getColorClass = (intensity: number): string => {
    switch (intensity) {
      case 0:
        return 'bg-[var(--color-background)] border border-[var(--color-border)]';
      case 1:
        return 'bg-[var(--color-primary-light)]';
      case 2:
        return 'bg-primary/40';
      case 3:
        return 'bg-primary/70';
      case 4:
        return 'bg-[var(--color-primary)]';
      default:
        return 'bg-[var(--color-background)] border border-[var(--color-border)]';
    }
  };

  const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  const todayCompleted = summary.todayQuizCount > 0;
  const selectedMessage = selectedDetail.quizCount > 0
    ? 'この調子で学習を続けましょう。'
    : '今日は1問だけでも解いて連続記録を伸ばしましょう。';

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-[var(--color-foreground)] flex items-center gap-2">
          <Icon name="calendar_month" size={20} className="text-[var(--color-primary)]" />
          学習カレンダー
        </h2>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            todayCompleted
              ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
              : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
          }`}
        >
          {todayCompleted ? '今日達成' : '今日未達'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--color-primary-light)] p-3">
          <p className="text-xs text-[var(--color-muted)]">連続学習</p>
          <p className="text-lg font-bold text-[var(--color-foreground)]">{summary.currentStreak}日</p>
        </div>
        <div className="rounded-xl bg-[var(--color-success-light)] p-3">
          <p className="text-xs text-[var(--color-muted)]">ベスト連続</p>
          <p className="text-lg font-bold text-[var(--color-foreground)]">{summary.bestStreak}日</p>
        </div>
        <div className="rounded-xl bg-[var(--color-surface)] p-3">
          <p className="text-xs text-[var(--color-muted)]">今週アクティブ</p>
          <p className="text-lg font-bold text-[var(--color-foreground)]">{summary.thisWeekActiveDays}日</p>
          <p className="text-[10px] text-[var(--color-muted)]">{summary.thisWeekQuizCount}問</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
          {dayLabels.map((day) => (
            <div key={day} className="h-[14px] w-4 flex items-center justify-end">
              {day}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-x-auto">
          <div className="space-y-1 min-w-fit">
            <div className="flex gap-1 pl-[1px]">
              {monthLabels.map((label, index) => (
                <div
                  key={`month_label_${index}`}
                  className="w-[14px] h-3 text-[10px] leading-3 text-[var(--color-muted)]"
                >
                  {label}
                </div>
              ))}
            </div>

            {grid.map((row, dayIndex) => (
              <div key={`heatmap_row_${dayIndex}`} className="flex gap-1">
                {row.map((day, weekIndex) => {
                  const isSelected = day.date === selectedDate;
                  const correctRate = day.quizCount > 0
                    ? Math.round((day.correctCount / day.quizCount) * 100)
                    : 0;

                  return (
                    <button
                      type="button"
                      key={`${day.date}_${weekIndex}`}
                      onClick={() => setSelectedDate(day.date)}
                      aria-label={`${day.date} ${day.quizCount}問 正答率${correctRate}%`}
                      className={`w-[14px] h-[14px] rounded-sm ${getColorClass(day.intensity)} ${
                        day.isToday ? 'ring-1 ring-[var(--color-primary)] ring-offset-1' : ''
                      } ${
                        isSelected ? 'outline outline-2 outline-[var(--color-foreground)] outline-offset-1' : ''
                      } transition-all`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-[var(--color-foreground)]">{selectedDateLabel}</p>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-full ${
              selectedDetail.quizCount > 0
                ? 'bg-[var(--color-success-light)] text-[var(--color-success)]'
                : 'bg-[var(--color-surface)] text-[var(--color-muted)]'
            }`}
          >
            {selectedDetail.statusLabel}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-[var(--color-primary-light)] p-3">
            <p className="text-[var(--color-muted)]">問題数</p>
            <p className="text-lg font-bold text-[var(--color-foreground)]">{selectedDetail.quizCount}問</p>
          </div>
          <div className="rounded-xl bg-[var(--color-success-light)] p-3">
            <p className="text-[var(--color-muted)]">正答率</p>
            <p className="text-lg font-bold text-[var(--color-foreground)]">{selectedDetail.correctRate}%</p>
          </div>
        </div>

        <p className="text-sm text-[var(--color-muted)]">{selectedMessage}</p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-primary)] text-white text-sm font-semibold"
        >
          <Icon name="play_arrow" size={18} className="text-white" />
          学習を続ける
        </Link>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs text-[var(--color-muted)]">
        <span>少</span>
        <div className="flex gap-[2px]">
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={`legend_${level}`}
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

  const [activityHistory, setActivityHistory] = useState<DailyActivity[]>(() =>
    getActivityHistory(CALENDAR_WEEKS),
  );

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

    if (isPro && user) {
      (async () => {
        try {
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - (CALENDAR_DAYS - 1));

          const supabase = createBrowserClient();
          const { data, error } = await supabase.rpc('get_daily_stats_range', {
            p_user_id: user.id,
            p_start_date: toDateKey(startDate),
            p_end_date: toDateKey(new Date()),
          });
          if (error || !data) return;

          const localHistory = getActivityHistory(CALENDAR_WEEKS);
          const mergedMap = new Map(localHistory.map((item) => [item.date, item]));

          for (const row of data as { active_date: string; quiz_count: number; correct_count: number }[]) {
            const existing = mergedMap.get(row.active_date);
            if (existing) {
              existing.quizCount = Math.max(existing.quizCount, row.quiz_count);
              existing.correctCount = Math.max(existing.correctCount, row.correct_count);
            } else {
              mergedMap.set(row.active_date, {
                date: row.active_date,
                quizCount: row.quiz_count,
                correctCount: row.correct_count,
              });
            }
          }

          const result: DailyActivity[] = [];
          const today = new Date();
          for (let offset = CALENDAR_DAYS - 1; offset >= 0; offset--) {
            const date = new Date(today);
            date.setDate(date.getDate() - offset);
            const dateKey = toDateKey(date);
            result.push(mergedMap.get(dateKey) ?? { date: dateKey, quizCount: 0, correctCount: 0 });
          }

          setActivityHistory(result);
        } catch {
          // local data is already shown as fallback
        }
      })();
    }
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
              <ActivityHeatmap activityHistory={activityHistory} />

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
