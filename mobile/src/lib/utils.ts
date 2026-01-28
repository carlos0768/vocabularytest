import AsyncStorage from '@react-native-async-storage/async-storage';
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
  WRONG_ANSWERS: 'scanvocab_wrong_answers',
  FLASHCARD_PROGRESS: 'scanvocab_flashcard_progress',
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

// Wrong answers tracking
export interface WrongAnswer {
  wordId: string;
  projectId: string;
  english: string;
  japanese: string;
  distractors: string[];
  wrongCount: number;
  lastWrongAt: number;
}

export async function recordWrongAnswer(
  wordId: string,
  english: string,
  japanese: string,
  projectId: string = '',
  distractors: string[] = []
): Promise<void> {
  try {
    const wrongAnswers = await getWrongAnswers();
    const existingIndex = wrongAnswers.findIndex(w => w.wordId === wordId);

    if (existingIndex >= 0) {
      // Update existing entry
      wrongAnswers[existingIndex].wrongCount += 1;
      wrongAnswers[existingIndex].lastWrongAt = Date.now();
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

    await AsyncStorage.setItem(STORAGE_KEYS.WRONG_ANSWERS, JSON.stringify(wrongAnswers));
  } catch (error) {
    console.error('Error recording wrong answer:', error);
  }
}

export async function getWrongAnswers(): Promise<WrongAnswer[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.WRONG_ANSWERS);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export async function removeWrongAnswer(wordId: string): Promise<void> {
  try {
    const wrongAnswers = await getWrongAnswers();
    const filtered = wrongAnswers.filter(w => w.wordId !== wordId);
    await AsyncStorage.setItem(STORAGE_KEYS.WRONG_ANSWERS, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing wrong answer:', error);
  }
}

export async function clearAllWrongAnswers(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.WRONG_ANSWERS);
  } catch (error) {
    console.error('Error clearing wrong answers:', error);
  }
}

// Flashcard progress tracking
export interface FlashcardProgress {
  wordIds: string[];
  currentIndex: number;
  savedAt: number;
}

const getProgressKey = (projectId: string, favoritesOnly: boolean): string =>
  `${STORAGE_KEYS.FLASHCARD_PROGRESS}_${projectId}${favoritesOnly ? '_favorites' : ''}`;

export async function saveFlashcardProgress(
  projectId: string,
  favoritesOnly: boolean,
  wordIds: string[],
  currentIndex: number
): Promise<void> {
  try {
    const progress: FlashcardProgress = {
      wordIds,
      currentIndex,
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(getProgressKey(projectId, favoritesOnly), JSON.stringify(progress));
  } catch (error) {
    console.error('Error saving flashcard progress:', error);
  }
}

export async function loadFlashcardProgress(
  projectId: string,
  favoritesOnly: boolean
): Promise<FlashcardProgress | null> {
  try {
    const stored = await AsyncStorage.getItem(getProgressKey(projectId, favoritesOnly));
    if (!stored) return null;

    const progress: FlashcardProgress = JSON.parse(stored);
    // Only return progress if it's less than 7 days old
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (progress.savedAt > sevenDaysAgo) {
      return progress;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearFlashcardProgress(
  projectId: string,
  favoritesOnly: boolean
): Promise<void> {
  try {
    await AsyncStorage.removeItem(getProgressKey(projectId, favoritesOnly));
  } catch (error) {
    console.error('Error clearing flashcard progress:', error);
  }
}

// Record activity for streak tracking
export async function recordActivity(): Promise<void> {
  try {
    await updateStreak();
  } catch (error) {
    console.error('Error recording activity:', error);
  }
}

// Record correct answer for stats
export async function recordCorrectAnswer(isMastered: boolean = false): Promise<void> {
  try {
    await updateDailyStats(true, isMastered);
  } catch (error) {
    console.error('Error recording correct answer:', error);
  }
}

