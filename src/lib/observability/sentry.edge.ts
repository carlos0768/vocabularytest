// Edgeランタイム用のSentry初期化（middleware・edge route）。
// `src/instrumentation.ts` の register() から NEXT_RUNTIME === 'edge' のときだけ
// 動的importされる。

import * as Sentry from '@sentry/nextjs';
import {
  buildServerSentryOptions,
  shouldInitServerSentry,
} from '@/lib/observability/sentry-server-options';

if (shouldInitServerSentry()) {
  Sentry.init(buildServerSentryOptions());
}
