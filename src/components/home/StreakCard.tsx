'use client';

import { Flame, Trophy } from 'lucide-react';
import type { StreakData } from '@/lib/streak';

interface StreakCardProps {
  streakData: StreakData;
  studiedToday: boolean;
}

export function StreakCard({ streakData, studiedToday }: StreakCardProps) {
  const { currentStreak, longestStreak, streakHistory } = streakData;

  // Get last 7 days for heatmap
  const last7Days = streakHistory.slice(-7);

  // Check if current streak is the longest
  const isRecord = currentStreak > 0 && currentStreak === longestStreak;

  return (
    <div className="relative p-5 rounded-[2rem] bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-peach)] shadow-glow overflow-hidden">
      {/* Decorative blur effect */}
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
      <div className="absolute -left-4 -bottom-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />

      <div className="relative z-10">
        {/* Header: Icon + Streak Count */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <Flame className={`w-6 h-6 ${studiedToday ? 'text-white' : 'text-white/60'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-white">{currentStreak}</span>
              <span className="text-white/80 font-medium">日連続学習中!</span>
            </div>
            {isRecord && (
              <div className="flex items-center gap-1 text-white/90 text-sm">
                <Trophy className="w-4 h-4" />
                <span>最長記録更新中!</span>
              </div>
            )}
          </div>
        </div>

        {/* 7-Day Heatmap */}
        <div className="flex items-center justify-between">
          {last7Days.map((day, index) => {
            const isToday = index === last7Days.length - 1;
            return (
              <div key={day.date} className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-full transition-all ${
                    day.studied
                      ? 'bg-white shadow-lg scale-110'
                      : 'bg-white/20'
                  } ${isToday && !day.studied ? 'ring-2 ring-white/50 ring-dashed' : ''}`}
                />
                <span className="text-[10px] text-white/60">
                  {['月', '火', '水', '木', '金', '土', '日'][index]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
