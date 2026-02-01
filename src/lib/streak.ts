// Streak tracking with history
// Uses localStorage key: merken_streak

export interface StreakData {
  currentStreak: number;      // 現在の連続日数
  longestStreak: number;      // 最長記録
  lastStudyDate: string;      // ISO 8601 (YYYY-MM-DD)
  streakHistory: {            // 過去30日分の記録
    date: string;
    studied: boolean;
  }[];
}

const STREAK_STORAGE_KEY = 'merken_streak';

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterdayString(): string {
  return new Date(Date.now() - 86400000).toISOString().split('T')[0];
}

function generateLast30Days(): { date: string; studied: boolean }[] {
  const result: { date: string; studied: boolean }[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    result.push({ date: d.toISOString().split('T')[0], studied: false });
  }
  return result;
}

function createInitialData(): StreakData {
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: '',
    streakHistory: generateLast30Days(),
  };
}

export function getStreakData(): StreakData {
  if (typeof window === 'undefined') return createInitialData();

  const stored = localStorage.getItem(STREAK_STORAGE_KEY);
  if (!stored) return createInitialData();

  try {
    const data: StreakData = JSON.parse(stored);

    // Recalculate streak validity based on current date
    const today = getTodayString();
    const yesterday = getYesterdayString();

    if (data.lastStudyDate !== today && data.lastStudyDate !== yesterday) {
      // Streak is broken - reset currentStreak but keep longestStreak and history
      data.currentStreak = 0;
    }

    // Refresh history to always cover the last 30 days
    const last30 = generateLast30Days();
    const studiedDates = new Set(
      data.streakHistory.filter(h => h.studied).map(h => h.date)
    );
    data.streakHistory = last30.map(day => ({
      date: day.date,
      studied: studiedDates.has(day.date),
    }));

    return data;
  } catch {
    return createInitialData();
  }
}

export function recordStudy(): void {
  if (typeof window === 'undefined') return;

  const data = getStreakData();
  const today = getTodayString();

  // Already recorded today
  if (data.lastStudyDate === today) return;

  const yesterday = getYesterdayString();

  if (data.lastStudyDate === yesterday) {
    // Continue streak
    data.currentStreak += 1;
  } else {
    // Start new streak
    data.currentStreak = 1;
  }

  // Update longest streak
  if (data.currentStreak > data.longestStreak) {
    data.longestStreak = data.currentStreak;
  }

  data.lastStudyDate = today;

  // Mark today as studied in history
  const todayEntry = data.streakHistory.find(h => h.date === today);
  if (todayEntry) {
    todayEntry.studied = true;
  }

  localStorage.setItem(STREAK_STORAGE_KEY, JSON.stringify(data));
}

export function getStreakStatus(): { studiedToday: boolean } {
  if (typeof window === 'undefined') return { studiedToday: false };

  const data = getStreakData();
  const today = getTodayString();

  return {
    studiedToday: data.lastStudyDate === today,
  };
}
