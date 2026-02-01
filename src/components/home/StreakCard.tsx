'use client';

import { Flame, Trophy } from 'lucide-react';
import type { StreakData } from '@/lib/streak';

interface StreakCardProps {
  streakData: StreakData;
  studiedToday: boolean;
}

export function StreakCard({ streakData, studiedToday }: StreakCardProps) {
  const { currentStreak, longestStreak, streakHistory } = streakData;

  // Last 7 days from history (history is sorted oldest-first, take last 7)
  const last7Days = streakHistory.slice(-7);

  // Day labels (single char)
  const dayLabels = ['月', '火', '水', '木', '金', '土', '日'];

  const isNewRecord = currentStreak > 0 && currentStreak === longestStreak;

  return (
    <div className="relative p-5 rounded-[2rem] bg-[var(--color-peach-light)] dark:bg-[var(--color-surface)] shadow-soft overflow-hidden">
      {/* Decorative blur */}
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-[var(--color-primary)]/10 rounded-full blur-2xl" />

      <div className="relative z-10">
        {/* Top row: streak count + badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              currentStreak > 0
                ? 'bg-[var(--color-primary)]/20'
                : 'bg-[var(--color-muted)]/10'
            }`}>
              <Flame className={`w-5 h-5 ${
                currentStreak > 0
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-muted)]'
              }`} />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-muted)]">連続学習</p>
              <p className="text-xl font-bold text-[var(--color-foreground)] leading-tight">
                {currentStreak > 0 ? `${currentStreak}日目` : '—'}
              </p>
            </div>
          </div>

          {isNewRecord && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] text-xs font-semibold">
              <Trophy className="w-3 h-3" />
              最長記録
            </span>
          )}
        </div>

        {/* 7-day heatmap */}
        <div className="flex items-center gap-2">
          {last7Days.map((day, i) => {
            const date = new Date(day.date);
            const dayLabel = dayLabels[date.getDay() === 0 ? 6 : date.getDay() - 1];
            const isToday = i === last7Days.length - 1;

            return (
              <div key={day.date} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[10px] font-medium text-[var(--color-muted)]">{dayLabel}</span>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                    day.studied
                      ? 'bg-[var(--color-primary)] shadow-[0_2px_8px_rgba(255,107,107,0.3)]'
                      : isToday && !studiedToday
                        ? 'border-2 border-dashed border-[var(--color-primary)]/40 bg-transparent'
                        : 'bg-[var(--color-muted)]/10'
                  }`}
                >
                  {day.studied && (
                    <Flame className="w-3.5 h-3.5 text-white" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
