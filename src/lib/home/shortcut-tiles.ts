/**
 * ホーム上部のショートカットグリッド（Spotify風 2カラム）の枠埋めロジック。
 * 優先順は 自分の単語帳 → 参加中のグループ → おすすめ共有単語帳。
 * 自分の単語帳の候補と並びは selectHomeShortcutProjects が決める。
 * 自分のコンテンツで枠が埋まる場合、おすすめは一切表示されない。
 */

export type HomeShortcutTile<P, G, B> =
  | { kind: 'project'; project: P }
  | { kind: 'group'; group: G }
  | { kind: 'recommendation'; book: B };

/** グリッド全体の枠数 */
export const HOME_SHORTCUT_GRID_SIZE = 8;

/**
 * コンテンツ（単語帳/グループ/おすすめ）に使える枠数。
 * 固定タイル（デスクトップの TODAY'S GOAL タイル、保存済み単語タイル）を
 * 除いた残り。モバイルのホームには固定タイルが無い（今日の復習・保存済みは
 * 目標ページ /goal と /favorites に移した）ので `fixedTiles = 0` で呼ぶ。
 * ホーム側は「グリッドに載った単語帳数 = min(単語帳数, この枠数)」として
 * 溢れた単語帳だけを下のマイ単語帳リストに出す。
 */
export function homeShortcutContentSlots(fixedTiles: number): number {
  return Math.max(0, HOME_SHORTCUT_GRID_SIZE - fixedTiles);
}

/** 「直近使った」とみなす期間。これより前に使った単語帳はバインダー内なら出さない */
export const HOME_SHORTCUT_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type ShortcutProjectCandidate = {
  id: string;
  binder?: string | null;
};

/**
 * 単語帳ID → その単語帳を直接使った時刻 (ISO)。`src/lib/projects/recent-use.ts` の記録。
 * 単語の lastReviewedAt は 復習 などの横断出題でも更新されるので使わない。
 */
export type ShortcutRecentUse = Readonly<Record<string, string>>;

function recentUsedAtMs(projectId: string, recentUse: ShortcutRecentUse, nowMs: number): number | null {
  const raw = recentUse[projectId];
  if (!raw) return null;
  const usedAt = Date.parse(raw);
  if (Number.isNaN(usedAt) || nowMs - usedAt > HOME_SHORTCUT_RECENT_WINDOW_MS) return null;
  return usedAt;
}

/**
 * ショートカットグリッドに載せる単語帳の候補と並び順を決める。
 * - 直近 (HOME_SHORTCUT_RECENT_WINDOW_MS 以内) に直接使った単語帳を、新しい順に先頭へ。
 *   バインダーに入っている単語帳もここでは出す（ふだんはバインダーのタイルの
 *   中にしか出ないが、続きをすぐ開けるようにする）。
 *   復習・今日の学習など単語帳横断の出題で学習しただけの単語帳は「使った」に入らない。
 * - 残りはバインダーに入っていない単語帳だけを、渡された順（従来の並び）で続ける。
 */
export function selectHomeShortcutProjects<P extends ShortcutProjectCandidate>(
  projects: readonly P[],
  recentUse: ShortcutRecentUse,
  now: Date = new Date(),
): P[] {
  const nowMs = now.getTime();
  const recent: { project: P; usedAt: number }[] = [];
  const rest: P[] = [];
  for (const project of projects) {
    const usedAt = recentUsedAtMs(project.id, recentUse, nowMs);
    if (usedAt !== null) {
      recent.push({ project, usedAt });
    } else if (!project.binder?.trim()) {
      rest.push(project);
    }
  }
  // Array.prototype.sort は安定ソートなので、同時刻なら元の並びを保つ
  recent.sort((a, b) => b.usedAt - a.usedAt);
  return [...recent.map((entry) => entry.project), ...rest];
}

export function buildHomeShortcutTiles<P, G, B>(options: {
  projects: readonly P[];
  groups: readonly G[];
  recommendations: readonly B[];
  /** コンテンツ用の枠数（goal タイルを除いた数） */
  slots: number;
}): HomeShortcutTile<P, G, B>[] {
  const { projects, groups, recommendations, slots } = options;
  const tiles: HomeShortcutTile<P, G, B>[] = [];

  for (const project of projects) {
    if (tiles.length >= slots) return tiles;
    tiles.push({ kind: 'project', project });
  }
  for (const group of groups) {
    if (tiles.length >= slots) return tiles;
    tiles.push({ kind: 'group', group });
  }
  for (const book of recommendations) {
    if (tiles.length >= slots) return tiles;
    tiles.push({ kind: 'recommendation', book });
  }

  return tiles;
}
