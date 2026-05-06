# Docs Consistency Audit

2026-05-07時点のdocsの矛盾・古い可能性がある記述・履歴資料として扱うべき記述の棚卸しです。

この文書は一覧化が目的です。既存docs本文の大幅修正、コード変更、認証、課金、scan、同期、DB migration、過去のSupabase migration変更は行いません。

## 調査範囲

- 入口と引き継ぎ: `docs/README.md`, `docs/maintenance/AI_HANDOFF.md`, `docs/maintenance/TASKS.md`, `docs/maintenance/DECISIONS.md`
- 現行docs: `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/commands.md`, `docs/runbooks.md`, `docs/ops/README.md`
- 設定と実装根拠: `package.json`, `.env.example`, `vercel.json`, `src/instrumentation.ts`, `src/instrumentation-client.ts`
- 課金実装: `src/app/api/subscription/`, `src/lib/stripe/`, `src/lib/komoju/`, `src/lib/appstore/`
- DB根拠: `supabase/migrations/`

作業前確認:

- `git status --short`: clean
- branch: `main`
- origin: `https://github.com/carlos0768/vocabularytest.git`

## 実装根拠

- Sentry: `src/instrumentation.ts` と `src/instrumentation-client.ts` はno-op。`.env.example` にSentry envはなく、`package.json` に `@sentry/nextjs` はない。
- Stripe: 現行Web課金は `src/app/api/subscription/create/route.ts`, `webhook/route.ts`, `reconcile/route.ts`, `cancel/route.ts` と `src/lib/stripe/` が実装根拠。
- KOMOJU: `src/lib/komoju/` は残っているが、現行 `src/app/api/subscription/` のWeb課金経路ではStripeを使う。
- App Store / IAP: `src/app/api/subscription/appstore/verify/route.ts`, `notifications/route.ts`, `src/lib/appstore/`, `.env.example` の `APPLE_IAP_*` と `IAP_PRO_PRODUCT_IDS` が根拠。
- grammar route: `src/app/grammar/` と `src/app/api/grammar/` は存在せず、`vercel.json` に `src/app/api/grammar/route.ts` のtimeoutはない。
- Cloud Run: `src/lib/ai/providers/index.ts` は `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` の両方がある場合にCloud Run providerを使う。
- migration数: `supabase/migrations/` 直下のファイル数は76。
- test: `npm test` は `npm run test:web` を呼び、`test:web` は45ファイルの固定リスト。
- verify: `npm run verify` は `npm run lint:web && npm run security:all && npm test && npm run test:security && npm run build`。

## 修正済みで問題なし

- Sentry記述:
  - 現行docsはSentry未使用として同期済み。
  - `.env.example` にSentry envはない。
  - `src/instrumentation.ts` / `src/instrumentation-client.ts` はno-op。
- Stripe / KOMOJUの現行Web課金:
  - `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/runbooks.md`, `docs/ops/README.md` は現行Web課金をStripe中心としている。
  - KOMOJU資料は履歴として扱う注意書きがある。
- grammar route:
  - `vercel.json` に存在しない `src/app/api/grammar/route.ts` のtimeout設定は残っていない。
  - `CLAUDE.md`, `docs/architecture.md`, `docs/boundaries.md` はgrammar routeが現存しないことを明記している。
- `npm run lint` / `npm run verify`:
  - `docs/README.md`, `docs/commands.md`, `docs/security/README.md` は `npm run lint` を広範囲legacy lint、公開前Web gateを `npm run lint:web` / `npm run verify` と説明している。
  - `package.json` の `verify` と `docs/commands.md` の説明は一致している。
- migration数:
  - `CLAUDE.md`, `docs/architecture.md`, `docs/runbooks.md` は76 filesへ同期済み。

## 履歴資料として意図的に残す

- KOMOJU資料:
  - `docs/KOMOJU_BILLING_SPEC.md`
  - `docs/ops-komoju-incident-2026-02-09.md`
  - `docs/qa/komoju-payment-test-matrix.md`
  - `docs/komoju-monitoring.sql`
  - いずれも現行Web課金の正ではなく、旧KOMOJU経路や過去障害の調査資料として残す。
- 調査・監査スナップショット:
  - `docs/_discovery_notes.md`
  - `docs/prelaunch-maintainability-audit.md`
  - `docs/research.md`
  - KOMOJU、Sentry、migration数、grammar route、`npm run lint`、`npm test` の古い記述があるが、履歴または調査メモとして明示されている。
- 旧実装:
  - `src/lib/komoju/` は旧Web課金実装として残す。
  - `npm run test:web` には `src/lib/komoju/client.test.ts` が含まれるが、これは現行Web課金の正がKOMOJUであることを意味しない。

## 古い可能性があるが公開前には影響が低い

- `docs/runbooks.md` の `package.json` line 22 参照:
  - 現在の `package.json` ではscript行がずれている。
  - 手順の意味は「固定リストへ追加」で通じるため、公開前影響は低い。
- ローカル絶対パス:
  - `docs/commands.md` と `docs/security/*.md` に `/Users/haradakarurosukei/.../englishvo` の絶対パスが残る。
  - Windowsパスではないが、公開用docsとしては相対パスへ寄せる候補。
- READMEのclone先:
  - `README.md` は `git clone https://github.com/carlos0768/vocabularytest.git` と `cd vocabularytest` を案内している。
  - origin URLは一致しているため古いとは断定しない。ローカルworktree名 `englishvo` との差は記録のみ。
- `docs/_discovery_notes.md` の依存バージョンとline番号:
  - 調査メモとして扱われているため公開前影響は低い。
  - 正式な依存バージョン確認は `package.json` を優先する。

## 公開前に修正すべき

- `docs/boundaries.md` のmigration数:
  - `docs/boundaries.md` は「approximately 43 migration files」と書いている。
  - 実態は `supabase/migrations/` 直下76 filesで、他の正式docsは76へ同期済み。
  - DB変更時の危険領域説明なので、公開前に76へ直すべき。
- `docs/ops/scan-example-sentences-runbook.md` のrepo外絶対リンク:
  - `scan-gemini-cloudrun-runbook.md` へのリンクが `.codex/worktrees/...` の絶対パスになっている。
  - 現在repo外のworktreeを指すため、運用Runbookとして壊れやすい。
  - 相対リンク `scan-gemini-cloudrun-runbook.md` へ直すべき。

## 実装確認が必要

- Supabase RLS:
  - `docs/invariants.md` は「Audited 2026-03-02 / All tables have RLS enabled」としている。
  - `docs/boundaries.md` と `docs/_discovery_notes.md` は「newer tablesのRLS未確認」としている。
  - migration grepでは多くの `ENABLE ROW LEVEL SECURITY` を確認できるが、live DB、本番schema drift、全policy妥当性まではこの監査では確認していない。
- Cloud Run:
  - コード上は `CLOUD_RUN_URL` と `CLOUD_RUN_AUTH_TOKEN` の両方がある場合にCloud Run経由。
  - README冒頭の「Cloud Run経由」は、本番env確認なしに常時経由とは断定しない。
  - 本番でCloud Runを必須にしているかはVercel env / Cloud Run設定確認が必要。
- App Store / IAP:
  - コードと `.env.example` にはApp Store Server API / Notifications V2の経路がある。
  - 本番App Store Connect設定、product id、Sandbox/Production通知の到達は外部確認が必要。
- 固定リスト除外test:
  - `src/lib/supabase/session-cache.test.ts` と `src/app/api/shared-projects/shared.test.ts` は `npm run test:web` から除外中。
  - 仕様確認後に別タスクで扱う。

## 次の扱い

- 本監査はdocsの矛盾一覧であり、既存docs本文の大幅修正ではない。
- 公開前に直すべき2件は `docs/maintenance/TASKS.md` に残す。
- RLS、Cloud Run、App Store / IAPの本番実態は、実装確認または外部環境確認が必要な別タスクとして扱う。
