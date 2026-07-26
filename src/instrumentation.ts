// Next.js instrumentation hook。プロセス起動時に1度だけ呼ばれる。
//
// Sentryのserver/edge初期化はここから動的importする。DSN未設定なら
// 各モジュール側で初期化をスキップするので、ローカル開発では実質no-op。

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('@/lib/observability/sentry.server');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('@/lib/observability/sentry.edge');
  }
}

// App Routerのサーバー側（RSC / Route Handler / middleware）で投げられた
// エラーをSentryへ送る。Next.jsが自動で呼ぶ規約フック。
export const onRequestError = Sentry.captureRequestError;
