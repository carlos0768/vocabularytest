// server / edge ランタイム共通のSentry初期化オプション。
// サーバー側では NEXT_PUBLIC_* もそのまま process.env から読めるので、
// SENTRY_DSN を優先しつつクライアント用DSNへフォールバックする。

import {
  createBeforeSend,
  IGNORED_ERROR_PATTERNS,
  isSentryEnabled,
  resolveSentryEnvironment,
  resolveTracesSampleRate,
} from '@/lib/observability/sentry-config';

export function resolveServerSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
}

export function buildServerSentryOptions() {
  return {
    dsn: resolveServerSentryDsn(),
    environment: resolveSentryEnvironment(
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      process.env.APP_ENV,
      process.env.NODE_ENV,
    ),
    // Vercelのデプロイ単位でリリースを識別する（未設定ならSentry側の既定に任せる）
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: resolveTracesSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    // IPアドレス・Cookie・リクエストヘッダの自動添付を無効化する。
    // 学習データやメールアドレスを外部SaaSへ流さないための既定。
    sendDefaultPii: false,
    ignoreErrors: IGNORED_ERROR_PATTERNS,
    beforeSend: createBeforeSend(),
    debug: false,
  };
}

/** DSN未設定なら初期化自体を行わない。 */
export function shouldInitServerSentry(): boolean {
  return isSentryEnabled(resolveServerSentryDsn());
}
