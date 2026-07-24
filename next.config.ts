import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // 型チェックは `next build` から切り離し、専用の `npm run typecheck`
  // (tsc --noEmit) と CI で担保する。ビルド自体を速く保つため。
  typescript: { ignoreBuildErrors: true },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizeCss: true,
    viewTransition: true,
  },
};

export default nextConfig;
