// ホーム最上部の「スキャン完了」表示に出すジョブを選ぶ。
//
// ホームを離れている間に終わったスキャンも、戻ってきたときに知らせたいので、
// 「ポーリング中に完了へ変わった瞬間」ではなく「最近完了して、まだ閉じていない」
// ジョブを出す。閉じたジョブID は localStorage に持つ（端末ごとで十分）。

export interface HomeScanCompletionJob {
  id: string;
  status: string;
  project_id?: string | null;
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
    if (options.dismissedIds.has(job.id)) continue;

    const completedAt = job.updated_at ? Date.parse(job.updated_at) : Number.NaN;
    if (!Number.isFinite(completedAt) || options.now - completedAt > windowMs) continue;

    notices.push({
      id: job.id,
      projectId: job.project_id,
      projectTitle: job.project_title?.trim() || '単語帳',
      wordCount: parseResultWordCount(job.result),
    });
  }

  return notices;
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
