'use client';

import { useEffect } from 'react';

/**
 * Global error boundary — catches errors in the root layout itself.
 * Must include its own <html> and <body> since the layout may have crashed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
  }, [error]);

  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>MERKEN - エラー</title>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8fafc;
            color: #1a1a2e;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
          }
          @media (prefers-color-scheme: dark) {
            body { background: #0f1117; color: #e8e8ed; }
            .card { background: #1a1b23; border-color: #2a2b35; }
            .btn-secondary { border-color: #2a2b35; color: #a0a0b0; }
            .btn-secondary:hover { background: #1a1b23; }
            .icon-bg { background: #3b1111; }
          }
          .container { max-width: 22rem; width: 100%; text-align: center; }
          .icon-bg {
            width: 4rem; height: 4rem; margin: 0 auto 1.5rem;
            border-radius: 50%; background: #fef2f2;
            display: flex; align-items: center; justify-content: center;
          }
          .icon-bg .material-symbols-outlined { font-size: 2rem; color: #ef4444; }
          h2 { font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; }
          p { font-size: 0.875rem; color: #71717a; line-height: 1.5; margin-bottom: 1.5rem; }
          .actions { display: flex; flex-direction: column; gap: 0.75rem; }
          .btn {
            display: block; width: 100%; padding: 0.75rem 1rem;
            border-radius: 0.75rem; font-size: 0.875rem; font-weight: 600;
            cursor: pointer; text-decoration: none; text-align: center;
            border: none; transition: opacity 0.15s;
          }
          .btn-primary { background: #137fec; color: #fff; }
          .btn-primary:hover { opacity: 0.9; }
          .btn-secondary {
            background: transparent; color: #71717a;
            border: 1px solid #e5e7eb;
          }
          .btn-secondary:hover { background: #f1f5f9; }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="icon-bg">
            <span className="material-symbols-outlined">error</span>
          </div>
          <h2>エラーが発生しました</h2>
          <p>
            一時的な問題が発生しました。<br />
            再試行するか、ホームに戻ってください。
          </p>
          <div className="actions">
            <button onClick={reset} className="btn btn-primary">
              再試行
            </button>
            <a href="/" className="btn btn-secondary">
              ホームに戻る
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
