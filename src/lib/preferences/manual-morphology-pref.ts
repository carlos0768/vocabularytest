/**
 * 手動追加の語源解析トグル設定（端末ローカル保存）
 *
 * オンのとき enrich-manual API に includeMorphology: true を渡して語源解析
 * （とそのコイン消費）を行う。デフォルトはオン（従来挙動）。
 * localStorage が使えない環境（SSR・プライベートモード等）では常にオン扱い。
 */

const STORAGE_KEY = 'merken-manual-morphology';

export function readManualMorphologyPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeManualMorphologyPref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // 保存できなくても現在のセッション内の state では有効
  }
}
