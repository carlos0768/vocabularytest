'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error boundary caught:', error);
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
          <a
            href="/"
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] font-semibold hover:bg-[var(--color-surface)] transition-colors inline-block"
          >
            ホームに戻る
          </a>
        </div>
      </div>
    </div>
  );
}
