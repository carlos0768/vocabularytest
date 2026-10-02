/**
 * 単語帳を「直接」使った時刻の記録。ホーム上部のショートカットグリッドが
 * 「直近使った単語帳」を選ぶのに使う（selectHomeShortcutProjects）。
 *
 * 単語の lastReviewedAt は 復習・今日の学習・保存済み などの単語帳横断の出題でも
 * 更新されるので、そこからは「その単語帳を開いて使ったか」が分からない。
 * そのため単語帳ページや、単語帳1冊ぶんの学習画面（クイズ・フラッシュカードなど）を
 * 開いたときだけここに記録する。横断の出題（projectId が `all`）では記録しない。
 *
 * 端末の localStorage に持つ（目標や1日の復習上限と同じ扱いで端末間は同期しない）。
 * SSR では常に空。
 */

const STORAGE_KEY = 'merken-project-recent-use';

/** 記録しておく単語帳の上限。古いものから捨てる */
export const PROJECT_RECENT_USE_LIMIT = 50;

/** 単語帳IDではない擬似ID（横断の出題） */
const PSEUDO_PROJECT_IDS = new Set(['all']);

export type ProjectRecentUseMap = Record<string, string>;

function isRecentUseMap(value: unknown): value is ProjectRecentUseMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

export function isRecordableProjectId(projectId: string | null | undefined): projectId is string {
  return typeof projectId === 'string' && projectId.length > 0 && !PSEUDO_PROJECT_IDS.has(projectId);
}

/** 記録に1件足した結果（新しい順に上限まで）。純粋関数 */
export function withProjectUse(
  current: ProjectRecentUseMap,
  projectId: string,
  usedAt: Date,
): ProjectRecentUseMap {
  const entries = Object.entries(current).filter(([id]) => id !== projectId);
  entries.push([projectId, usedAt.toISOString()]);
  entries.sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
  return Object.fromEntries(entries.slice(0, PROJECT_RECENT_USE_LIMIT));
}

export function getProjectRecentUse(): ProjectRecentUseMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecentUseMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 単語帳を直接使ったことを記録する。擬似ID（横断の出題）は無視する */
export function markProjectUsed(projectId: string | null | undefined, usedAt: Date = new Date()): void {
  if (typeof window === 'undefined' || !isRecordableProjectId(projectId)) return;
  try {
    const next = withProjectUse(getProjectRecentUse(), projectId, usedAt);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
