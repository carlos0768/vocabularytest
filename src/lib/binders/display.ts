/**
 * バインダーの見た目まわりの小物。バインダー詳細と設定ページで共有する。
 */

/** 単語帳タイルと同じ配色 (home-client / projects の THUMBS と同一) */
const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

/** ID や名前から決まる面の色。同じ文字列なら常に同じ色になる。 */
export function thumbColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

/** `projects.binder` の値を突き合わせ用に正規化する (未設定は空文字)。 */
export function normalizeBinder(value: string | null | undefined): string {
  return value?.trim() ?? '';
}
