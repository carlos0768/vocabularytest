// ホーム最上部の「スキャン完了」「スキャン失敗」表示に出すジョブを選ぶ。
//
// ホームを離れている間に終わったスキャンも、戻ってきたときに知らせたいので、
// 「ポーリング中に完了へ変わった瞬間」ではなく「最近完了して、まだ閉じていない」
// ジョブを出す。閉じたジョブID は localStorage に持つ（端末ごとで十分）。

export interface HomeScanCompletionJob {
  id: string;
  status: string;
  project_id?: string | null;
  target_project_id?: string | null;
  error_message?: string | null;
  project_title?: string | null;
  result?: string | null;
  updated_at?: string | null;
}

export interface HomeScanCompletionNotice {
  id: string;
  projectId: string;
  projectTitle: string;
  /** 実際に保存された語数。結果が読めなければ null */
  wordCount: number | null;
}

export interface HomeScanFailureNotice {
  id: string;
  projectTitle: string;
  /** 既存の単語帳へ追加しようとして失敗したなら、その単語帳ID */
  targetProjectId: string | null;
  /** ユーザーに見せる失敗理由 */
  message: string;
}

// 失敗したのに error_message が無い場合の予備文言。
// 「単語帳を撮影しなかった（＝単語が写っていない）」ケースを想定した、
// 理由が伝わる日本語メッセージを表示する。
export const SCAN_JOB_FAILED_FALLBACK_MESSAGE =
  '画像から単語を読み取れませんでした。単語帳や英単語がはっきり写るように、もう一度撮影してください。';

/** これより前に完了したスキャンはもう知らせない */
export const HOME_SCAN_COMPLETION_WINDOW_MS = 30 * 60 * 1000;

const DISMISSED_STORAGE_KEY = 'merken_scan_completion_dismissed';
const DISMISSED_KEEP_LIMIT = 30;

export function selectHomeScanCompletionNotices(
  jobs: readonly HomeScanCompletionJob[],
  options: { now: number; dismissedIds: ReadonlySet<string>; windowMs?: number },
): HomeScanCompletionNotice[] {
  const windowMs = options.windowMs ?? HOME_SCAN_COMPLETION_WINDOW_MS;
  const notices: HomeScanCompletionNotice[] = [];

  for (const job of jobs) {
    if (job.status !== 'completed') continue;
    // 開く先が無い完了（端末保存のジョブ）はここでは扱わない
    if (!job.project_id) continue;
    if (!isRecentAndUndismissed(job, options.now, windowMs, options.dismissedIds)) continue;

    notices.push({
      id: job.id,
      projectId: job.project_id,
      projectTitle: job.project_title?.trim() || '単語帳',
      wordCount: parseResultWordCount(job.result),
    });
  }

  return notices;
}

export function selectHomeScanFailureNotices(
  jobs: readonly HomeScanCompletionJob[],
  options: { now: number; dismissedIds: ReadonlySet<string>; windowMs?: number },
): HomeScanFailureNotice[] {
  const windowMs = options.windowMs ?? HOME_SCAN_COMPLETION_WINDOW_MS;
  const notices: HomeScanFailureNotice[] = [];

  for (const job of jobs) {
    if (job.status !== 'failed') continue;
    if (!isRecentAndUndismissed(job, options.now, windowMs, options.dismissedIds)) continue;

    notices.push({
      id: job.id,
      projectTitle: job.project_title?.trim() || '単語帳',
      targetProjectId: job.target_project_id || null,
      message: job.error_message?.trim() || SCAN_JOB_FAILED_FALLBACK_MESSAGE,
    });
  }

  return notices;
}

function isRecentAndUndismissed(
  job: HomeScanCompletionJob,
  now: number,
  windowMs: number,
  dismissedIds: ReadonlySet<string>,
): boolean {
  if (dismissedIds.has(job.id)) return false;
  const finishedAt = job.updated_at ? Date.parse(job.updated_at) : Number.NaN;
  return Number.isFinite(finishedAt) && now - finishedAt <= windowMs;
}

export function parseResultWordCount(result: string | null | undefined): number | null {
  if (!result) return null;
  try {
    const parsed = JSON.parse(result) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const count = (parsed as { wordCount?: unknown }).wordCount;
    return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
  } catch {
    return null;
  }
}

export function readDismissedScanCompletionIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function addDismissedScanCompletionId(current: ReadonlySet<string>, jobId: string): Set<string> {
  const next = [...current.values()].filter((id) => id !== jobId);
  next.push(jobId);
  const trimmed = next.slice(-DISMISSED_KEEP_LIMIT);
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // 保存できなくても、このページを開いている間は閉じたままにする
  }
  return new Set(trimmed);
}
