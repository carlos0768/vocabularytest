import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  ignoreErrors: [
    "ResizeObserver loop",
    "ChunkLoadError",
    "Load failed",
    "Failed to fetch",
    "Network request failed",
    "AbortError",
  ],
  enabled: process.env.NODE_ENV === "production",
});
