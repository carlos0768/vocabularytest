/**
 * 「今日の学習」「復習」など /quiz/all で単語帳をまたいで出題する画面が、
 * どの単語帳に絞るかを渡すための sessionStorage キー。
 *
 * URL には乗せず sessionStorage 経由にしているのは、絞り込み対象の単語帳IDが
 * 複数・可変長になり得るため (URLに全部乗せると長くなる、履歴にも残る)。
 */
import { normalizeSectionScope, type SectionScope } from '@/lib/project/word-sections';

const REVIEW_PROJECT_FILTER_STORAGE_KEY = 'quiz-review-project-filter';
/** 単語帳の中のセクションでさらに絞るとき (目標の「今日の10問」) だけ書く */
const REVIEW_SECTION_FILTER_STORAGE_KEY = 'quiz-review-section-filter';

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

export function readReviewSectionFilter(): SectionScope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(REVIEW_SECTION_FILTER_STORAGE_KEY);
    return raw ? normalizeSectionScope(JSON.parse(raw)) ?? null : null;
  } catch {
    return null;
  }
}

/**
 * 単語帳の絞り込みを書く。セクションの絞り込みは単語帳と組なので、指定が無ければ消す
 * (出題画面で単語帳を選び直したら、その単語帳は全セクションに戻る)。
 */
export function writeReviewProjectFilter(
  projectIds: string[] | null,
  sectionScope: SectionScope | null = null,
): void {
  if (typeof window === 'undefined') return;
  try {
    if (projectIds && projectIds.length > 0) {
      sessionStorage.setItem(REVIEW_PROJECT_FILTER_STORAGE_KEY, JSON.stringify(projectIds));
    } else {
      sessionStorage.removeItem(REVIEW_PROJECT_FILTER_STORAGE_KEY);
    }
    if (projectIds && projectIds.length > 0 && sectionScope && Object.keys(sectionScope).length > 0) {
      sessionStorage.setItem(REVIEW_SECTION_FILTER_STORAGE_KEY, JSON.stringify(sectionScope));
    } else {
      sessionStorage.removeItem(REVIEW_SECTION_FILTER_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}
