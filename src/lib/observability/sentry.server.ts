// Node.jsランタイム用のSentry初期化。`src/instrumentation.ts` の register() から
// NEXT_RUNTIME === 'nodejs' のときだけ動的importされる。

import * as Sentry from '@sentry/nextjs';
import {
  buildServerSentryOptions,
  shouldInitServerSentry,
} from '@/lib/observability/sentry-server-options';

if (shouldInitServerSentry()) {
  Sentry.init(buildServerSentryOptions());
}
