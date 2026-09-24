import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizeCss: true,
    viewTransition: true,
    // Client Router Cache の保持時間。Next 15+ の既定は dynamic=0 で、ホーム(/)や
    // 共有(/shared)のような動的ルートはタブを叩くたびにサーバーへ RSC を取りに行き、
    // 応答が届くまで前の画面が固まって見えていた。30秒はキャッシュを再利用し、
    // タブの往復や「戻る」を即時にする（router.refresh() は従来どおり再取得する）。
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

// source mapのアップロードは認証情報が揃っているときだけ行う。
// ローカルやtoken未設定のPreviewでビルドを落とさないための条件。
const canUploadSourceMaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // CI以外ではビルドログを汚さない
  silent: !process.env.CI,
  telemetry: false,

  sourcemaps: {
    disable: !canUploadSourceMaps,
    // アップロード後に .map を削除し、本番の静的配信にソースを露出させない
    deleteSourcemapsAfterUpload: true,
  },

  // /_next/static 配下のchunkもアップロードし、スタックトレースを解決可能にする
  widenClientFileUpload: true,

  // Session Replayは使わない方針なので、関連コードごとバンドルから落とす。
  // excludeTracing は付けない（SENTRY_TRACES_SAMPLE_RATE で後から有効化するため）。
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
  },
});
