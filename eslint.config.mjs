import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "mobile/**",
    "cloud-run-scan/dist/**",
    "動画素材/**",
    ".claude/**",
  ]),
  {
    // `_` で始まる名前は「わざと使わない引数・分割代入」の印 (インターフェース
    // を満たすだけの実装や、テストのスタブで使う)。
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // CommonJS: scripts/ helpers and the gcp-budget-guard Cloud Function
    // (its own package, deployed separately from the Next.js app).
    files: ["scripts/**/*.js", "gcp-budget-guard/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
