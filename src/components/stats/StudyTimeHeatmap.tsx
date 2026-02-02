'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { getStudyTimeDistribution } from '@/lib/stats';

export function StudyTimeHeatmap() {
  const timeSlots = useMemo(() => getStudyTimeDistribution(), []);

  const maxCount = Math.max(...timeSlots.map(t => t.count), 1);
  const totalCount = timeSlots.reduce((sum, t) => sum + t.count, 0);

  // Find peak hours
  const peakHours = timeSlots
    .map((t, i) => ({ hourIndex: i, ...t }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const getIntensityClass = (count: number): string => {
    const ratio = count / maxCount;
    if (ratio === 0) return 'bg-[var(--color-surface)]';
    if (ratio <= 0.25) return 'bg-[var(--color-peach-light)]';
    if (ratio <= 0.5) return 'bg-[var(--color-peach)]';
    if (ratio <= 0.75) return 'bg-[var(--color-primary)]/70';
    return 'bg-[var(--color-primary)]';
  };

  const formatHour = (hour: number): string => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-[var(--color-primary)]" />
        <h3 className="font-bold text-[var(--color-foreground)]">学習時間帯分析</h3>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-6">
          <p className="text-[var(--color-muted)]">📊 まだデータがありません</p>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            クイズを解くと時間帯分析が表示されます
          </p>
        </div>
      ) : (
        <>
          {/* Peak Hours */}
          <div className="mb-4 p-3 bg-[var(--color-peach-light)] rounded-xl">
            <p className="text-sm text-[var(--color-muted)] mb-2">活発な時間帯</p>
            <div className="flex flex-wrap gap-2">
              {peakHours.map((slot) => (
                <span
                  key={slot.hour}
                  className="px-3 py-1 bg-white rounded-full text-sm font-medium text-[var(--color-primary)]"
                >
                  {formatHour(slot.hour)} ~ {formatHour((slot.hour + 1) % 24)}
                  <span className="ml-1 text-[var(--color-muted)]">({slot.count}回)</span>
                </span>
              ))}
            </div>
          </div>

          {/* Heatmap Grid */}
          <div className="grid grid-cols-6 gap-1">
            {timeSlots.map((slot) => (
              <div
                key={slot.hour}
                className={`
                  relative aspect-square rounded-lg ${getIntensityClass(slot.count)}
                  transition-all hover:scale-110 hover:z-10
                  flex items-center justify-center
                `}
                title={`${formatHour(slot.hour)}: ${slot.count}回 (正答率${slot.accuracy}%)`}
              >
                <span className="text-[10px] text-[var(--color-muted)]">
                  {slot.hour}
                </span>

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[var(--color-foreground)] text-white text-xs rounded opacity-0 hover:opacity-100 pointer-events-none whitespace-nowrap z-20">
                  {formatHour(slot.hour)}: {slot.count}回
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between mt-4 text-xs text-[var(--color-muted)]">
            <span>00:00</span>
            <div className="flex items-center gap-1">
              <span>少</span>
              <div className="flex gap-0.5">
                <div className="w-3 h-3 bg-[var(--color-surface)] rounded"></div>
                <div className="w-3 h-3 bg-[var(--color-peach-light)] rounded"></div>
                <div className="w-3 h-3 bg-[var(--color-peach)] rounded"></div>
                <div className="w-3 h-3 bg-[var(--color-primary)]/70 rounded"></div>
                <div className="w-3 h-3 bg-[var(--color-primary)] rounded"></div>
              </div>
              <span>多</span>
            </div>
            <span>23:00</span>
          </div>
        </>
      )}
    </div>
  );
}
