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

  try {
    let guestId = localStorage.getItem(GUEST_ID_KEY);
    if (!guestId) {
      guestId = `guest_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')}`;
      localStorage.setItem(GUEST_ID_KEY, guestId);
    }
    return guestId;
  } catch {
    // localStorage blocked (private browsing, storage full, etc.)
    return 'guest_fallback';
  }
}

// Daily scan limit tracking for free users
const SCAN_COUNT_KEY = 'scanvocab_scan_count';
const SCAN_DATE_KEY = 'scanvocab_scan_date';
// Free plan limits (must match server-side in /api/extract and /api/grammar)
export const FREE_DAILY_SCAN_LIMIT = 3;
export const FREE_WORD_LIMIT = 100;

export function getDailyScanInfo(): { count: number; remaining: number; canScan: boolean } {
  if (typeof window === 'undefined') {
    return { count: 0, remaining: FREE_DAILY_SCAN_LIMIT, canScan: true };
  }

  const today = new Date().toISOString().split('T')[0];
  const storedDate = localStorage.getItem(SCAN_DATE_KEY);

  // Reset count if it's a new day
  if (storedDate !== today) {
    localStorage.setItem(SCAN_DATE_KEY, today);
    localStorage.setItem(SCAN_COUNT_KEY, '0');
    return { count: 0, remaining: FREE_DAILY_SCAN_LIMIT, canScan: true };
  }

  const count = parseInt(localStorage.getItem(SCAN_COUNT_KEY) || '0', 10);
  const remaining = Math.max(0, FREE_DAILY_SCAN_LIMIT - count);

  return { count, remaining, canScan: count < FREE_DAILY_SCAN_LIMIT };
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

// ---- Stats sync callback mechanism ----
// Pro users register a callback to sync stats to Supabase on each mutation.

type StatsSyncCallback = (
  event: 'daily_stats' | 'streak' | 'wrong_answer' | 'remove_wrong_answer' | 'clear_wrong_answers',
  payload: Record<string, unknown>,
) => void;

let statsSyncCallback: StatsSyncCallback | null = null;

export function registerStatsSyncCallback(cb: StatsSyncCallback | null): void {
  statsSyncCallback = cb;
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

  // Sync streak to remote
  const updatedStreak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
  statsSyncCallback?.('streak', { streakCount: updatedStreak, lastActivityDate: today });
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

  // Sync daily stats to remote
  statsSyncCallback?.('daily_stats', {
    date: today,
    quizCount: stats.todayCount,
    correctCount: stats.correctCount,
    masteredCount: stats.masteredCount,
  });

  // Also record to activity history for heatmap
  recordDailyActivity(true);
}

// Wrong answers storage
const WRONG_ANSWERS_KEY = 'scanvocab_wrong_answers';

export interface WrongAnswer {
  wordId: string;
  projectId: string;
  english: string;
  japanese: string;
  distractors: string[];
  wrongCount: number;
  lastWrongAt: number;
}

export function recordWrongAnswer(
  wordId: string,
  english: string,
  japanese: string,
  projectId: string = '',
  distractors: string[] = []
): void {
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

  // Also record to activity history for heatmap
  recordDailyActivity(false);

  // Save wrong answer to list
  const wrongAnswers = getWrongAnswers();
  const existingIndex = wrongAnswers.findIndex(w => w.wordId === wordId);

  if (existingIndex >= 0) {
    // Update existing entry
    wrongAnswers[existingIndex].wrongCount += 1;
    wrongAnswers[existingIndex].lastWrongAt = Date.now();
    // Update distractors if provided
    if (distractors.length > 0) {
      wrongAnswers[existingIndex].distractors = distractors;
    }
  } else {
    // Add new entry
    wrongAnswers.push({
      wordId,
      projectId,
      english,
      japanese,
      distractors,
      wrongCount: 1,
      lastWrongAt: Date.now(),
    });
  }

  localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(wrongAnswers));

  // Sync daily stats + wrong answer to remote
  statsSyncCallback?.('daily_stats', {
    date: today,
    quizCount: stats.todayCount,
    correctCount: stats.correctCount,
    masteredCount: stats.masteredCount,
  });

  const savedWrongAnswer = wrongAnswers.find(w => w.wordId === wordId);
  if (savedWrongAnswer) {
    statsSyncCallback?.('wrong_answer', { wrongAnswer: savedWrongAnswer });
  }
}

export function getWrongAnswers(): WrongAnswer[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(WRONG_ANSWERS_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function removeWrongAnswer(wordId: string): void {
  if (typeof window === 'undefined') return;

  const wrongAnswers = getWrongAnswers();
  const filtered = wrongAnswers.filter(w => w.wordId !== wordId);
  localStorage.setItem(WRONG_ANSWERS_KEY, JSON.stringify(filtered));

  statsSyncCallback?.('remove_wrong_answer', { wordId });
}

export function clearAllWrongAnswers(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WRONG_ANSWERS_KEY);

  statsSyncCallback?.('clear_wrong_answers', {});
}

// Weekly activity heatmap tracking
const ACTIVITY_HISTORY_KEY = 'scanvocab_activity_history';

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  quizCount: number;
  correctCount: number;
}

// Get activity history for the past N weeks (default 4 weeks = 28 days)
export function getActivityHistory(weeks: number = 4): DailyActivity[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(ACTIVITY_HISTORY_KEY);
  let history: DailyActivity[] = [];

  if (stored) {
    try {
      history = JSON.parse(stored);
    } catch {
      history = [];
    }
  }

  // Generate array for past N weeks
  const result: DailyActivity[] = [];
  const today = new Date();
  const daysToShow = weeks * 7;

  for (let i = daysToShow - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const existing = history.find(h => h.date === dateStr);
    result.push(existing || { date: dateStr, quizCount: 0, correctCount: 0 });
  }

  return result;
}

// Record activity for today (called when answering quiz)
export function recordDailyActivity(isCorrect: boolean): void {
  if (typeof window === 'undefined') return;

  const today = new Date().toISOString().split('T')[0];
  const stored = localStorage.getItem(ACTIVITY_HISTORY_KEY);
  let history: DailyActivity[] = [];

  if (stored) {
    try {
      history = JSON.parse(stored);
    } catch {
      history = [];
    }
  }

  // Find or create today's entry
  const todayIndex = history.findIndex(h => h.date === today);
  if (todayIndex >= 0) {
    history[todayIndex].quizCount += 1;
    if (isCorrect) {
      history[todayIndex].correctCount += 1;
    }
  } else {
    history.push({
      date: today,
      quizCount: 1,
      correctCount: isCorrect ? 1 : 0,
    });
  }

  // Keep only last 60 days to prevent localStorage bloat
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 60);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  history = history.filter(h => h.date >= cutoffStr);

  localStorage.setItem(ACTIVITY_HISTORY_KEY, JSON.stringify(history));
}

/**
 * ログアウト時に全ユーザー統計データをlocalStorageからクリアする。
 * ユーザーIDに紐づかないキーがアカウント間で混在するのを防ぐ。
 */
export function clearAllUserStats(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DAILY_STATS_KEY);
  localStorage.removeItem(STREAK_KEY);
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  localStorage.removeItem(WRONG_ANSWERS_KEY);
  localStorage.removeItem(ACTIVITY_HISTORY_KEY);
}
