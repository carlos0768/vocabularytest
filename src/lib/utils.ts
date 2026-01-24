import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for merging Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shuffle array using Fisher-Yates algorithm
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate guest user ID (stored in localStorage)
const GUEST_ID_KEY = 'scanvocab_guest_id';

export function getGuestUserId(): string {
  if (typeof window === 'undefined') {
    return 'server-side';
  }

  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = `guest_${crypto.randomUUID()}`;
    localStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}

// Daily scan limit tracking for free users
const SCAN_COUNT_KEY = 'scanvocab_scan_count';
const SCAN_DATE_KEY = 'scanvocab_scan_date';
const FREE_DAILY_LIMIT = 10;

export function getDailyScanInfo(): { count: number; remaining: number; canScan: boolean } {
  if (typeof window === 'undefined') {
    return { count: 0, remaining: FREE_DAILY_LIMIT, canScan: true };
  }

  const today = new Date().toISOString().split('T')[0];
  const storedDate = localStorage.getItem(SCAN_DATE_KEY);

  // Reset count if it's a new day
  if (storedDate !== today) {
    localStorage.setItem(SCAN_DATE_KEY, today);
    localStorage.setItem(SCAN_COUNT_KEY, '0');
    return { count: 0, remaining: FREE_DAILY_LIMIT, canScan: true };
  }

  const count = parseInt(localStorage.getItem(SCAN_COUNT_KEY) || '0', 10);
  const remaining = Math.max(0, FREE_DAILY_LIMIT - count);

  return { count, remaining, canScan: count < FREE_DAILY_LIMIT };
}

export function incrementScanCount(): void {
  if (typeof window === 'undefined') return;

  const today = new Date().toISOString().split('T')[0];
  localStorage.setItem(SCAN_DATE_KEY, today);

  const currentCount = parseInt(localStorage.getItem(SCAN_COUNT_KEY) || '0', 10);
  localStorage.setItem(SCAN_COUNT_KEY, String(currentCount + 1));
}

// Format date for display
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Streak tracking
const STREAK_KEY = 'scanvocab_streak';
const LAST_ACTIVITY_KEY = 'scanvocab_last_activity';

export function getStreakDays(): number {
  if (typeof window === 'undefined') return 0;

  const streak = localStorage.getItem(STREAK_KEY);
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);

  if (!streak || !lastActivity) return 0;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // If last activity was today or yesterday, streak is valid
  if (lastActivity === today || lastActivity === yesterday) {
    return parseInt(streak, 10);
  }

  // Streak broken
  return 0;
}

export function recordActivity(): void {
  if (typeof window === 'undefined') return;

  const today = new Date().toISOString().split('T')[0];
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  const currentStreak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);

  if (lastActivity === today) {
    // Already recorded today
    return;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (lastActivity === yesterday) {
    // Continue streak
    localStorage.setItem(STREAK_KEY, String(currentStreak + 1));
  } else {
    // Start new streak
    localStorage.setItem(STREAK_KEY, '1');
  }

  localStorage.setItem(LAST_ACTIVITY_KEY, today);
}

// Daily stats tracking
const DAILY_STATS_KEY = 'scanvocab_daily_stats';

interface DailyStats {
  date: string;
  todayCount: number;
  correctCount: number;
  masteredCount: number;
}

export function getDailyStats(): { todayCount: number; correctCount: number; masteredCount: number } {
  if (typeof window === 'undefined') {
    return { todayCount: 0, correctCount: 0, masteredCount: 0 };
  }

  const today = new Date().toISOString().split('T')[0];
  const stored = localStorage.getItem(DAILY_STATS_KEY);

  if (!stored) {
    return { todayCount: 0, correctCount: 0, masteredCount: 0 };
  }

  try {
    const stats: DailyStats = JSON.parse(stored);
    if (stats.date !== today) {
      // Reset for new day
      return { todayCount: 0, correctCount: 0, masteredCount: 0 };
    }
    return {
      todayCount: stats.todayCount,
      correctCount: stats.correctCount,
      masteredCount: stats.masteredCount,
    };
  } catch {
    return { todayCount: 0, correctCount: 0, masteredCount: 0 };
  }
}

export function recordCorrectAnswer(becameMastered: boolean = false): void {
  if (typeof window === 'undefined') return;

  const today = new Date().toISOString().split('T')[0];
  const stored = localStorage.getItem(DAILY_STATS_KEY);

  let stats: DailyStats = {
    date: today,
    todayCount: 0,
    correctCount: 0,
    masteredCount: 0,
  };

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.date === today) {
        stats = parsed;
      }
    } catch {
      // Use default
    }
  }

  stats.todayCount += 1;
  stats.correctCount += 1;
  if (becameMastered) {
    stats.masteredCount += 1;
  }

  localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(stats));
}

export function recordWrongAnswer(wordId: string, english: string, japanese: string): void {
  if (typeof window === 'undefined') return;

  const today = new Date().toISOString().split('T')[0];
  const stored = localStorage.getItem(DAILY_STATS_KEY);

  let stats: DailyStats = {
    date: today,
    todayCount: 0,
    correctCount: 0,
    masteredCount: 0,
  };

  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.date === today) {
        stats = parsed;
      }
    } catch {
      // Use default
    }
  }

  stats.todayCount += 1;

  localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(stats));
}
