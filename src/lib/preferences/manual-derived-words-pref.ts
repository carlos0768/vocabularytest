/**
 * 手動追加の派生語トグル設定（端末ローカル保存）
 *
 * オンのとき enrich-manual API に includeDerivedWords: true を渡して派生語生成
 * （とそのコイン消費）を行う。デフォルトはオフ — 語源解析と違い後から追加された
 * 有料オプションなので、既存ユーザーが気づかないうちにコインを使わないようにする。
 * localStorage が使えない環境（SSR・プライベートモード等）では常にオフ扱い。
 */

const STORAGE_KEY = 'merken-manual-derived-words';

export function readManualDerivedWordsPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeManualDerivedWordsPref(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // 保存できなくても現在のセッション内の state では有効
  }
}
