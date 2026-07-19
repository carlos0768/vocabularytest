'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import {
  CHUNK_RELOAD_STORAGE_KEY,
  shouldAutoReloadForChunkError,
} from '@/lib/errors/chunk-load';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error boundary caught:', error);

    // デプロイ切替直後は旧HTMLが参照する旧チャンクが404になり、ここに
    // 落ちる（バージョンスキュー）。再読み込みで新しいHTMLを取得すれば
    // 直るので、一度だけ自動リロードして自己回復させる。直近にリロード
    // 済みならループを避けて通常のエラー表示に任せる。
    try {
      const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)) || 0;
      if (shouldAutoReloadForChunkError(error, lastReloadAt, Date.now())) {
        sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // sessionStorage が使えない環境では自動リロードだけ諦める
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-background)]">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-50 dark:bg-red-950 flex items-center justify-center">
          <span className="material-symbols-outlined text-red-500" style={{ fontSize: 32 }}>
            error
          </span>
        </div>

        <div>
          <h2 className="text-lg font-bold text-[var(--color-foreground)]">
            エラーが発生しました
          </h2>
          <p className="text-sm text-[var(--color-muted)] mt-2">
            一時的な問題が発生しました。再試行するか、ホームに戻ってください。
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full px-4 py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            再試行
          </button>
          <Link
            href="/"
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] font-semibold hover:bg-[var(--color-surface)] transition-colors inline-block"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
