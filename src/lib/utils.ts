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
const FREE_DAILY_LIMIT = 3;

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
