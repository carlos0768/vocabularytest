'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { getWeeklyStats, type WeeklyStatsEntry } from '@/lib/utils';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface DayCell {
  entry: WeeklyStatsEntry;
  masteredDelta: number;
  dayOfWeek: number;
  dateObj: Date;
  isToday: boolean;
}

/**
 * Weekly calendar widget shown on the home screen.
 * Displays the last 7 days, highlighting activity per day.
 * Tapping a day shows how many words were reviewed / mastered.
 */
export function WeeklyCalendarWidget() {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const days = useMemo<DayCell[]>(() => {
    const all = getWeeklyStats(); // last 14 days
    const last7 = all.slice(-7);
    const todayStr = new Date().toISOString().split('T')[0];
    return last7.map((entry, i) => {
      const prev = all[all.length - 7 + i - 1];
      const prevMastered = prev?.masteredCount ?? entry.masteredCount;
      const masteredDelta = Math.max(0, entry.masteredCount - prevMastered);
      const dateObj = new Date(`${entry.date}T00:00:00`);
      return {
        entry,
        masteredDelta,
        dayOfWeek: dateObj.getDay(),
        dateObj,
        isToday: entry.date === todayStr,
      };
    });
  }, []);

  const selected = selectedIdx !== null ? days[selectedIdx] : null;

  return (
    <section>
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[var(--color-foreground)]">
            <Icon name="calendar_month" size={14} className="inline align-[-2px] mr-1" />
            今週の学習
          </h2>
          <span className="text-[0.7rem] text-[var(--color-muted)]">直近7日間</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const count = day.entry.totalCount;
            const active = count > 0;
            const isSelected = selectedIdx === i;
            return (
              <button
                key={day.entry.date}
                type="button"
                onClick={() => setSelectedIdx(isSelected ? null : i)}
                className={`flex flex-col items-center rounded-lg py-1.5 transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]'
                    : 'hover:bg-[var(--color-surface-secondary)]'
                }`}
              >
                <span className="text-[0.65rem] text-[var(--color-muted)]">
                  {DAY_LABELS[day.dayOfWeek]}
                </span>
                <span
                  className={`mt-0.5 text-sm font-bold ${
                    day.isToday ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
                  }`}
                >
                  {day.dateObj.getDate()}
                </span>
                <span
                  className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-semibold ${
                    active
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-secondary)] text-[var(--color-muted)]'
                  }`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className="mt-3 rounded-lg bg-[var(--color-surface-secondary)] px-3 py-2 text-xs">
            <p className="font-semibold text-[var(--color-foreground)]">
              {selected.dateObj.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                weekday: 'short',
              })}
            </p>
            <p className="mt-0.5 text-[var(--color-muted)]">
              クイズ {selected.entry.totalCount} 問 / 正解 {selected.entry.correctCount} 問
              {selected.masteredDelta > 0 && (
                <> ・ <span className="text-[var(--color-success)]">+{selected.masteredDelta} 語習得</span></>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
