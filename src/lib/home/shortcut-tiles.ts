/**
 * ホーム上部のショートカットグリッド（Spotify風 2カラム）の枠埋めロジック。
 * 優先順は 自分の単語帳 → 参加中のグループ → おすすめ共有単語帳。
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
