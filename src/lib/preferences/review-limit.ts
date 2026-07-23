/**
 * 1日に復習する問題数の上限設定 (設定ページから変更)。
 * 復習対象が多すぎてやる気を失わないよう、復習クイズの出題対象を
 * この上限まで絞り込む。0 は「無制限」を意味する。
 * localStorage が使えない環境 (SSR等) では常にデフォルトを返す。
 */

const STORAGE_KEY = 'merken-daily-review-limit';

export const DEFAULT_DAILY_REVIEW_LIMIT = 50;

/** 設定ページに出す選択肢。0 は無制限 */
export const DAILY_REVIEW_LIMIT_OPTIONS = [10, 25, 50, 100, 0] as const;

export function getDailyReviewLimit(): number {
  if (typeof window === 'undefined') return DEFAULT_DAILY_REVIEW_LIMIT;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_DAILY_REVIEW_LIMIT;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_REVIEW_LIMIT;
  } catch {
    return DEFAULT_DAILY_REVIEW_LIMIT;
  }
}

export function setDailyReviewLimit(limit: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, Math.floor(limit))));
  } catch {
    // ignore
  }
}

export function dailyReviewLimitLabel(limit: number): string {
  return limit === 0 ? '無制限' : `${limit}問`;
}
