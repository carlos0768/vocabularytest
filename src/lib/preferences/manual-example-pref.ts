/**
 * 手動追加の例文生成トグル設定（端末ローカル保存）
 *
 * オンのとき enrich-manual API に includeExample: true を渡して例文を生成する。
 * 手動追加の例文はコインを取らない（スキャンの +2 は1回のスキャンで数十語ぶん
 * 生成するのに対し、手動追加は1語なので、同じ値付けにする意味がない）。
 *
 * **既定はオン**。明示的にオフにした端末だけ例文を作らない。localStorage が
 * 使えない環境（SSR・プライベートモード等）でもオン扱いにする。
 */

const STORAGE_KEY = 'merken-manual-example';

export function readManualExamplePref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeManualExamplePref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // 保存できなくても現在のセッション内の state では有効
  }
}
