import type { DailyActivity } from '@/lib/utils';

export type IntensityLevel = 0 | 1 | 2 | 3 | 4;

export interface CalendarDayCell {
  date: string;
  quizCount: number;
  correctCount: number;
  intensity: IntensityLevel;
  isToday: boolean;
}

export interface CalendarSummary {
  currentStreak: number;
  bestStreak: number;
  thisWeekActiveDays: number;
  thisWeekQuizCount: number;
  todayQuizCount: number;
  todayCorrectRate: number;
}

export interface SelectedDayDetail {
  date: string;
  quizCount: number;
  correctCount: number;
  correctRate: number;
  statusLabel: '学習あり' | '学習なし';
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDateKey(dateKey: string, offsetDays: number): string {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
}

function getWeekStartKey(dateKey: string): string {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() - date.getDay());
  return toDateKey(date);
}

export function buildCalendarRange(weeks: number, today: Date): string[] {
  const safeWeeks = Math.max(1, weeks);
  const daysToShow = safeWeeks * 7;
  const endDate = new Date(today);
  endDate.setHours(0, 0, 0, 0);

  const range: string[] = [];
  for (let offset = daysToShow - 1; offset >= 0; offset--) {
    const date = new Date(endDate);
    date.setDate(endDate.getDate() - offset);
    range.push(toDateKey(date));
  }

  return range;
}

export function getIntensity(quizCount: number): IntensityLevel {
  if (quizCount <= 0) return 0;
  if (quizCount <= 5) return 1;
  if (quizCount <= 15) return 2;
  if (quizCount <= 30) return 3;
  return 4;
}

export function buildCalendarGrid(
  activityHistory: DailyActivity[],
  weeks: number,
  today: Date,
): CalendarDayCell[][] {
  const safeWeeks = Math.max(1, weeks);
  const range = buildCalendarRange(safeWeeks, today);
  const todayKey = toDateKey(today);
  const activityMap = new Map(activityHistory.map((item) => [item.date, item]));

  const rows: CalendarDayCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: safeWeeks }, () => ({
      date: '',
      quizCount: 0,
      correctCount: 0,
      intensity: 0,
      isToday: false,
    })),
  );

  range.forEach((dateKey, index) => {
    const date = fromDateKey(dateKey);
    const dayOfWeek = date.getDay();
    const weekIndex = Math.floor(index / 7);
    const activity = activityMap.get(dateKey);
    const quizCount = activity?.quizCount ?? 0;
    const correctCount = activity?.correctCount ?? 0;

    rows[dayOfWeek][weekIndex] = {
      date: dateKey,
      quizCount,
      correctCount,
      intensity: getIntensity(quizCount),
      isToday: dateKey === todayKey,
    };
  });

  return rows;
}

export function calculateCalendarSummary(
  cells: CalendarDayCell[],
  todayKey: string,
): CalendarSummary {
  const sorted = [...cells].filter((cell) => cell.date).sort((a, b) => a.date.localeCompare(b.date));
  const cellMap = new Map(sorted.map((cell) => [cell.date, cell]));
  const todayCell = cellMap.get(todayKey);

  let currentStreak = 0;
  let cursor = todayKey;
  while (true) {
    const cell = cellMap.get(cursor);
    if (!cell || cell.quizCount <= 0) break;
    currentStreak += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  let bestStreak = 0;
  let streak = 0;
  for (const cell of sorted) {
    if (cell.date > todayKey) break;
    if (cell.quizCount > 0) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }

  const weekStartKey = getWeekStartKey(todayKey);
  let thisWeekActiveDays = 0;
  let thisWeekQuizCount = 0;
  for (const cell of sorted) {
    if (cell.date < weekStartKey || cell.date > todayKey) continue;
    if (cell.quizCount > 0) {
      thisWeekActiveDays += 1;
      thisWeekQuizCount += cell.quizCount;
    }
  }

  const todayQuizCount = todayCell?.quizCount ?? 0;
  const todayCorrectRate = todayQuizCount > 0
    ? Math.round(((todayCell?.correctCount ?? 0) / todayQuizCount) * 100)
    : 0;

  return {
    currentStreak,
    bestStreak,
    thisWeekActiveDays,
    thisWeekQuizCount,
    todayQuizCount,
    todayCorrectRate,
  };
}

export function getSelectedDayDetail(
  cells: CalendarDayCell[],
  dateKey: string,
): SelectedDayDetail {
  const cell = cells.find((item) => item.date === dateKey);
  const quizCount = cell?.quizCount ?? 0;
  const correctCount = cell?.correctCount ?? 0;
  const correctRate = quizCount > 0 ? Math.round((correctCount / quizCount) * 100) : 0;

  return {
    date: dateKey,
    quizCount,
    correctCount,
    correctRate,
    statusLabel: quizCount > 0 ? '学習あり' : '学習なし',
  };
}
