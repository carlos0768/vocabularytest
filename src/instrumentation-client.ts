// ブラウザ用のSentry初期化。Next.jsがクライアントバンドルの先頭で読み込む。
//
// NEXT_PUBLIC_* は `process.env.NEXT_PUBLIC_X` というリテラル参照だけが
// ビルド時に実値へ置換される。変数経由で読むとundefinedになるので、
// ここでは必ず直接参照する。

import * as Sentry from '@sentry/nextjs';
import {
  createBeforeSend,
  IGNORED_ERROR_PATTERNS,
  isSentryEnabled,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
} from '@/lib/observability/sentry-config';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (isSentryEnabled(dsn)) {
  Sentry.init({
    dsn,
    environment: resolveSentryEnvironment(
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      undefined,
      process.env.NODE_ENV,
    ),
    tracesSampleRate: resolveTracesSampleRate(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ),
    // 学習中の単語・メールアドレス等を外部SaaSへ送らないための既定。
    // Session Replayも意図的に無効のまま（画面に単語帳の中身が映るため）。
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERROR_PATTERNS,
    beforeSend: createBeforeSend(),
    debug: false,
  });
}

// App Routerのクライアント側ナビゲーションをトレースへ紐づける規約フック。
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
