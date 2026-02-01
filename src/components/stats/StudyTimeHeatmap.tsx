'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { getStudyTimeDistribution } from '@/lib/stats';

export function StudyTimeHeatmap() {
  const slots = useMemo(() => getStudyTimeDistribution(), []);

  const maxCount = useMemo(() => Math.max(...slots.map(s => s.count), 1), [slots]);
  const totalCount = useMemo(() => slots.reduce((sum, s) => sum + s.count, 0), [slots]);

  // Find peak hour
  const peakHour = useMemo(() => {
    let max = 0;
    let hour = -1;
    for (const slot of slots) {
      if (slot.count > max) {
        max = slot.count;
        hour = slot.hour;
      }
    }
    return hour;
  }, [slots]);

  // Find most efficient hour (highest accuracy with at least 5 answers)
  const efficientHour = useMemo(() => {
    let bestAccuracy = 0;
    let hour = -1;
    for (const slot of slots) {
      if (slot.count >= 5 && slot.accuracy > bestAccuracy) {
        bestAccuracy = slot.accuracy;
        hour = slot.hour;
      }
    }
    return { hour, accuracy: bestAccuracy };
  }, [slots]);

  const getIntensity = (count: number): number => {
    if (count === 0) return 0;
    const ratio = count / maxCount;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  const getColorClass = (intensity: number): string => {
    switch (intensity) {
      case 0: return 'bg-[var(--color-background)] border border-[var(--color-border)]';
      case 1: return 'bg-[var(--color-peach-light)]';
      case 2: return 'bg-[var(--color-peach)]';
      case 3: return 'bg-[var(--color-primary)]/70';
      case 4: return 'bg-[var(--color-primary)]';
      default: return 'bg-[var(--color-background)] border border-[var(--color-border)]';
    }
  };

  const formatHour = (hour: number): string => {
    return `${hour}時`;
  };

  if (totalCount === 0) {
    return (
      <div className="card p-5">
        <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-[var(--color-primary)]" />
          学習時間帯
        </h2>
        <div className="flex items-center justify-center py-8 text-[var(--color-muted)] text-sm">
          まだ学習データがありません
        </div>
      </div>
    );
  }

  // Group into 4 rows of 6 hours each
  const rows = [
    { label: '深夜', hours: slots.slice(0, 6) },
    { label: '午前', hours: slots.slice(6, 12) },
    { label: '午後', hours: slots.slice(12, 18) },
    { label: '夜間', hours: slots.slice(18, 24) },
  ];

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
        <Clock className="w-5 h-5 text-[var(--color-primary)]" />
        学習時間帯
      </h2>

      {/* Heatmap grid */}
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted)] w-8 text-right flex-shrink-0">
              {row.label}
            </span>
            <div className="flex gap-1 flex-1">
              {row.hours.map(slot => (
                <div
                  key={slot.hour}
                  className={`flex-1 h-8 rounded-md ${getColorClass(getIntensity(slot.count))} transition-colors cursor-default flex items-center justify-center`}
                  title={`${formatHour(slot.hour)}: ${slot.count}問 (正答率 ${slot.accuracy}%)`}
                >
                  {slot.count > 0 && (
                    <span className="text-[10px] font-medium text-[var(--color-foreground)]/60">
                      {slot.count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* Hour labels */}
        <div className="flex items-center gap-2">
          <span className="w-8 flex-shrink-0" />
          <div className="flex gap-1 flex-1">
            {[0, 6, 12, 18].map((startHour, groupIdx) => (
              Array.from({ length: 6 }, (_, i) => (
                <div key={startHour + i} className="flex-1 text-center">
                  {i % 2 === 0 && groupIdx * 6 + i < 24 && (
                    <span className="text-[9px] text-[var(--color-muted)]">
                      {startHour + i}
                    </span>
                  )}
                </div>
              ))
            )).flat()}
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="mt-4 space-y-2">
        {peakHour >= 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--color-muted)]">最も学習する時間帯:</span>
            <span className="font-semibold text-[var(--color-foreground)]">
              {formatHour(peakHour)}
            </span>
          </div>
        )}
        {efficientHour.hour >= 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--color-muted)]">最も効率が良い時間帯:</span>
            <span className="font-semibold text-[var(--color-success)]">
              {formatHour(efficientHour.hour)}（正答率 {efficientHour.accuracy}%）
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 mt-3 text-xs text-[var(--color-muted)]">
        <span>少</span>
        <div className="flex gap-[2px]">
          {[0, 1, 2, 3, 4].map(level => (
            <div key={level} className={`w-3 h-3 rounded-sm ${getColorClass(level)}`} />
          ))}
        </div>
        <span>多</span>
      </div>
    </div>
  );
}
