import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// Generate UUID
export function generateId(): string {
  return uuidv4();
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

// Format date for display
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今日';
  } else if (diffDays === 1) {
    return '昨日';
  } else if (diffDays < 7) {
    return `${diffDays}日前`;
  } else {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  }
}

// Storage keys
const STORAGE_KEYS = {
  GUEST_ID: 'scanvocab_guest_id',
  SCAN_COUNT: 'scanvocab_scan_count',
  SCAN_DATE: 'scanvocab_scan_date',
  STREAK: 'scanvocab_streak',
  LAST_ACTIVITY: 'scanvocab_last_activity',
  DAILY_STATS: 'scanvocab_daily_stats',
};

// Get or create guest user ID
export async function getGuestUserId(): Promise<string> {
  try {
    let guestId = await AsyncStorage.getItem(STORAGE_KEYS.GUEST_ID);
    if (!guestId) {
      guestId = generateId();
      await AsyncStorage.setItem(STORAGE_KEYS.GUEST_ID, guestId);
    }
    return guestId;
  } catch {
    return generateId();
  }
}

// Get today's date string (YYYY-MM-DD)
function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Daily scan limit tracking
export async function getDailyScanInfo(): Promise<{
  count: number;
  remaining: number;
  canScan: boolean;
}> {
  const MAX_FREE_SCANS = 3;

  try {
    const storedDate = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_DATE);
    const storedCount = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_COUNT);
    const today = getTodayString();

    if (storedDate !== today) {
      // Reset count for new day
      await AsyncStorage.setItem(STORAGE_KEYS.SCAN_DATE, today);
      await AsyncStorage.setItem(STORAGE_KEYS.SCAN_COUNT, '0');
      return { count: 0, remaining: MAX_FREE_SCANS, canScan: true };
    }

    const count = parseInt(storedCount || '0', 10);
    const remaining = Math.max(0, MAX_FREE_SCANS - count);

    return {
      count,
      remaining,
      canScan: count < MAX_FREE_SCANS,
    };
  } catch {
    return { count: 0, remaining: MAX_FREE_SCANS, canScan: true };
  }
}

// Increment scan count
export async function incrementScanCount(): Promise<void> {
  try {
    const today = getTodayString();
    const storedDate = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_DATE);
    const storedCount = await AsyncStorage.getItem(STORAGE_KEYS.SCAN_COUNT);

    let count = 0;
    if (storedDate === today) {
      count = parseInt(storedCount || '0', 10);
    }

    await AsyncStorage.setItem(STORAGE_KEYS.SCAN_DATE, today);
    await AsyncStorage.setItem(STORAGE_KEYS.SCAN_COUNT, String(count + 1));

    // Update streak
    await updateStreak();
  } catch (error) {
    console.error('Error incrementing scan count:', error);
  }
}

// Update streak days
async function updateStreak(): Promise<void> {
  try {
    const today = getTodayString();
    const lastActivity = await AsyncStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
    const storedStreak = await AsyncStorage.getItem(STORAGE_KEYS.STREAK);

    let streak = parseInt(storedStreak || '0', 10);

    if (!lastActivity) {
      streak = 1;
    } else {
      const lastDate = new Date(lastActivity);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        streak += 1;
      } else if (diffDays > 1) {
        streak = 1;
      }
      // If diffDays === 0, keep the same streak
    }

    await AsyncStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, today);
    await AsyncStorage.setItem(STORAGE_KEYS.STREAK, String(streak));
  } catch (error) {
    console.error('Error updating streak:', error);
  }
}

// Get streak days
export async function getStreakDays(): Promise<number> {
  try {
    const storedStreak = await AsyncStorage.getItem(STORAGE_KEYS.STREAK);
    return parseInt(storedStreak || '0', 10);
  } catch {
    return 0;
  }
}

// Daily stats type
interface DailyStats {
  date: string;
  todayCount: number;
  correctCount: number;
  masteredCount: number;
}

// Get daily stats
export async function getDailyStats(): Promise<DailyStats> {
  try {
    const today = getTodayString();
    const storedStats = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_STATS);

    if (storedStats) {
      const stats: DailyStats = JSON.parse(storedStats);
      if (stats.date === today) {
        return stats;
      }
    }

    return { date: today, todayCount: 0, correctCount: 0, masteredCount: 0 };
  } catch {
    return { date: getTodayString(), todayCount: 0, correctCount: 0, masteredCount: 0 };
  }
}

// Update daily stats
export async function updateDailyStats(isCorrect: boolean, isMastered: boolean): Promise<void> {
  try {
    const stats = await getDailyStats();
    const today = getTodayString();

    const newStats: DailyStats = {
      date: today,
      todayCount: stats.date === today ? stats.todayCount + 1 : 1,
      correctCount: stats.date === today ? stats.correctCount + (isCorrect ? 1 : 0) : (isCorrect ? 1 : 0),
      masteredCount: stats.date === today ? stats.masteredCount + (isMastered ? 1 : 0) : (isMastered ? 1 : 0),
    };

    await AsyncStorage.setItem(STORAGE_KEYS.DAILY_STATS, JSON.stringify(newStats));

    // Update streak when quiz is taken
    await updateStreak();
  } catch (error) {
    console.error('Error updating daily stats:', error);
  }
}

// Secure storage for sensitive data
export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error('Error setting secure item:', error);
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error('Error getting secure item:', error);
    return null;
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error('Error deleting secure item:', error);
  }
}
