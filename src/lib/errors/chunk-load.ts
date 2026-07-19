// デプロイ切替直後のバージョンスキュー対策。
//
// デプロイが切り替わると、開きっぱなしの旧HTMLが参照するハッシュ付き
// JS/CSSチャンクは新デプロイに存在せず404になる。遅延読み込みのチャンクが
// 404を踏むと ChunkLoadError 系の例外が投げられ、エラーバウンダリに
// 「エラーが発生しました」が出る（スタイルも旧CSSごと消えるため素のHTMLで
// 表示される）。これはページを再読み込みして新しいHTMLを取得すれば直るので、
// エラーバウンダリ側で一度だけ自動リロードして自己回復させる。

const CHUNK_LOAD_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk .+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** チャンク読み込み失敗（=リロードで直る見込みが高い）由来のエラーか判定する。 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return typeof message === 'string' && CHUNK_LOAD_ERROR_PATTERN.test(message);
}

export const CHUNK_RELOAD_STORAGE_KEY = 'merken_chunk_reload_at';

// この間隔内の再リロードは行わない（新デプロイ側も壊れている場合の無限ループ防止）
export const CHUNK_RELOAD_MIN_INTERVAL_MS = 60_000;

/**
 * 自動リロードすべきか判定する（純粋関数）。直近に自動リロード済みなら
 * false を返し、通常のエラー表示にフォールバックさせる。
 */
export function shouldAutoReloadForChunkError(
  error: unknown,
  lastReloadAtMs: number,
  nowMs: number,
): boolean {
  if (!isChunkLoadError(error)) return false;
  return nowMs - lastReloadAtMs >= CHUNK_RELOAD_MIN_INTERVAL_MS;
}
