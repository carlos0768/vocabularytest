/**
 * 「今日の学習」「復習」など /quiz/all で単語帳をまたいで出題する画面が、
 * どの単語帳に絞るかを渡すための sessionStorage キー。
 *
 * URL には乗せず sessionStorage 経由にしているのは、絞り込み対象の単語帳IDが
 * 複数・可変長になり得るため (URLに全部乗せると長くなる、履歴にも残る)。
 */
const REVIEW_PROJECT_FILTER_STORAGE_KEY = 'quiz-review-project-filter';

export function readReviewProjectFilter(): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(REVIEW_PROJECT_FILTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') && parsed.length > 0
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function writeReviewProjectFilter(projectIds: string[] | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (projectIds && projectIds.length > 0) {
      sessionStorage.setItem(REVIEW_PROJECT_FILTER_STORAGE_KEY, JSON.stringify(projectIds));
    } else {
      sessionStorage.removeItem(REVIEW_PROJECT_FILTER_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
