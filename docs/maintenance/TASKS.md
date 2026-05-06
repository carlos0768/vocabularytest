# Maintenance Tasks

公開前の保守性向上工事で追うタスク一覧です。完了したものは日付つきでDoneへ移すか、`_archive/` に退避します。

## P0: 公開前に必ず終わらせる

現時点で未完了のP0はありません。

## P1: 公開前にできれば終わらせる

- [ ] 固定リストから除外した古いtestを別タスクで扱う
  - `src/lib/supabase/session-cache.test.ts`: 現行実装では `user_cookie`, `user_chunk`, `user_local` を期待する3件が `undefined` になり失敗する
  - `src/app/api/shared-projects/shared.test.ts`: 現行metrics payloadは `likeCount: 0` を含むが、2件の期待値が `likeCount` なしで失敗する
  - 公開前gateを壊さないため、上記2ファイルは `npm run test:web` の固定リストには入れていない
- [ ] docsの矛盾一覧を作る
  - まずは矛盾箇所を列挙し、修正は別タスクに分ける

## P2: 公開後に段階的に進める

- [ ] `src/app/api/scan-jobs/process/route.ts` を段階的に分割する
- [ ] `src/app/page.tsx` を段階的に分割する
- [ ] `src/app/project/[id]/page.tsx` を段階的に分割する
- [ ] `src/app/quiz/[projectId]/page.tsx` を段階的に分割する
- [ ] `src/lib/ai/prompts.ts` を用途別に整理する
- [ ] repository層、認証、課金、同期の設計を必要に応じて再点検する

## Done

- [x] 2026-05-07: テスト実行方式を整理し、公開前Web verifyの対象を明確化
  - repo内テスト棚卸し: root側は `src/**/*.test.ts`, `src/**/*.security.test.ts`, `shared/**/*.test.ts`, `scripts/**/*.test.mjs` に50 files、Cloud Run側は `cloud-run-scan/src/**/*.test.ts` に6 files
  - 旧 `npm test` 固定リストは28 files / 132 tests。固定リスト外は20 filesで、`src/app/api/security/route.security.test.ts` は `npm run test:security` 側の対象
  - 固定リスト外の通常test 19 filesのうち、17 filesは個別/小グループ実行で成功したため `npm run test:web` に追加
  - `scripts/check-*.test.mjs` と `src/app/api/**/*.security.test.ts` は `npm run test:security` の対象として維持し、`npm run verify` に `npm run test:security` を追加
  - `cloud-run-scan` は別packageのため root `npm run verify` には含めず、root helper `npm run test:cloud-run-scan` を追加
  - 除外: `src/lib/supabase/session-cache.test.ts` は3 failures、`src/app/api/shared-projects/shared.test.ts` は2 failures。テストを通すための本体仕様変更は行っていない
  - 確認: `npm test` 成功。183 tests pass
  - 確認: `npm run test:security` 成功。38 tests pass
  - 確認: `npm run verify` 成功。`lint:web` は0 errors / 98 warnings、`security:all` 成功、`npm test` は183 tests pass、`test:security` は38 tests pass、`build` 成功
  - 確認: `npm run test:cloud-run-scan` 成功。22 tests pass
- [x] 2026-05-07: 残りの日本語運用Runbookと本番環境変数チェックリストを追加
  - 追加: [`../ops/supabase-incident-runbook.md`](../ops/supabase-incident-runbook.md), [`../ops/ai-cost-spike-runbook.md`](../ops/ai-cost-spike-runbook.md), [`../ops/production-env-checklist.md`](../ops/production-env-checklist.md)
  - `docs/ops/README.md` から3本に辿れるようにリンクを追加
  - Supabase Runbookは Supabase Dashboard / Logs / Table Editor / SQL Editor / Vercel Runtime Logs、主要テーブル、RLS、読み取りSQL、migration事故時の禁止事項を根拠に初動手順化
  - AIコストRunbookは `/ops/api-costs`, `/api/ops/api-costs`, `api_cost_events`, Cloud Run fallback、OpenAI/Gemini/Google Cloud billing、AI制限envを根拠に初動手順化
  - 本番環境変数チェックリストは Vercel, Supabase, Stripe, Cloud Run, OpenAI/Gemini, Apple IAP, Resend, Web Push/APNS, Admin/internal worker の確認観点を整理
  - 確認: 新規Markdownの存在確認、相対リンク存在確認、`rg -n "supabase-incident|ai-cost-spike|production-env" docs/ops docs/maintenance`
  - `npm run verify`: 成功。`lint:web` は0 errors / 98 warnings、`security:all` 成功、`npm test` は132 tests pass、`build` 成功
- [x] 2026-05-07: 公開後の日本語初動Runbookを3本追加
  - 追加: [`../ops/scan-failure-runbook.md`](../ops/scan-failure-runbook.md), [`../ops/billing-stripe-failure-runbook.md`](../ops/billing-stripe-failure-runbook.md), [`../ops/login-auth-failure-runbook.md`](../ops/login-auth-failure-runbook.md)
  - `docs/ops/README.md` から3本に辿れるようにリンクを追加
  - スキャンは `/api/extract`, `/api/scan-jobs/*`, Cloud Run, `scan_jobs`, `daily_scan_usage`, `scan-images` を根拠に初動手順化
  - 課金はStripe中心で、`subscription_sessions`, `subscriptions`, `webhook_events`, `webhook` / `reconcile` の二経路を根拠に初動手順化。KOMOJU資料は履歴扱いと明記
  - 認証は `/api/auth/*`, Resend, Supabase Auth, `otp_requests`, middlewareを根拠に初動手順化
  - 確認: 新規Markdownの存在確認、相対リンク存在確認、`rg -n "scan-failure|billing-stripe|login-auth" docs/ops docs/maintenance`
  - `npm run verify`: 成功。`lint:web` は0 errors / 98 warnings、`npm test` は132 tests pass、`build` 成功
  - 残りの日本語Runbook候補: Supabase接続障害 / migration事故、AIコスト急増
- [x] 2026-05-06: docsの古い記述を実装に同期
  - 対象: `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/commands.md`, `docs/runbooks.md`, `.env.example`, `vercel.json`
  - Web課金説明をStripe中心へ統一。KOMOJU資料と `src/lib/komoju/` は履歴資料・過去実装として残す方針を明記
  - Sentry env例を `.env.example` から削除。現状は `src/instrumentation.ts` / `src/instrumentation-client.ts` がno-opで、Sentry未使用と明記
  - migration数を実態の76 filesへ更新
  - `docs/commands.md` の古いWindowsパスとテスト固定リストを現在のrepo/package.jsonに同期
  - 存在しない `src/app/api/grammar/route.ts` の `vercel.json` timeout設定を削除
  - `npm run verify`: 成功。`lint:web` は0 errors / 98 warnings、`npm test` は132 tests pass
  - 残ったKOMOJU/Sentry/grammar route記述: `docs/KOMOJU_BILLING_SPEC.md`, `docs/ops-komoju-incident-2026-02-09.md`, `docs/qa/komoju-payment-test-matrix.md`, `docs/komoju-monitoring.sql`, `docs/_discovery_notes.md`, `docs/research.md`, `docs/prelaunch-maintainability-audit.md` などの履歴・調査資料または同期済み判断メモ
  - 残った `npm run lint` 記述: legacy/broad lintとして説明している箇所のみ
  - 次にやるべきこと: 日本語障害対応Runbook、本番環境変数チェックリスト、テスト固定リスト方式の見直し
- [x] 2026-05-06: Web本体向けlint対象を分離し、公開前検証コマンドを定義
  - `npm run lint:web` を追加。対象は `src/`, `shared/`, Next/PostCSS/ESLint設定、security guard系scripts
  - `mobile/`, `ios-native/`, `cloud-run-scan/`, `stitch/`, `uisu/`, `vocabularytest*`, `legacy/`, `experimental/`, `動画素材/`, `.next/`, `node_modules/`, build/dist/coverage/out はWeb本体公開前lint対象外
  - `npm run verify` を追加。内容は `npm run lint:web && npm run security:all && npm test && npm run build`
  - Web本体lint errorsを低リスク修正。認証、課金、scan limit、同期queue、DB migrationの仕様変更なし
  - `npm run lint:web`: 成功。0 errors / 98 warnings
  - `npm run security:all`: 成功
  - `npm test`: 成功。132 tests pass
  - `npm run build`: 成功
  - `npm run verify`: 成功
- [x] 2026-05-06: secrets guardの失敗を整理し、`security:all` を通過
  - `CLAUDE.md` のStripe webhook secret例を実prefix風でないdummy値へ変更
  - `src/lib/api/internal-worker.ts` とtestの実secretではない値・変数名による誤検知をdummy表現へ整理
  - `security/secrets-allowlist.json` は空のまま維持
  - `npm run security:secrets`: 成功。violations 0
  - `npm run security:all`: 成功
  - `npm run test:security:secrets`: 成功。7 tests pass
  - `npm run build`: 成功
  - `npm test`: 成功。132 tests pass
  - 次にやるべきこと: lint対象整理と公開前検証コマンド定義
- [x] 2026-05-06: `package-lock.json` と実際のinstall結果を一致させ、dependency auditのhigh/criticalを解消
  - `npm ls next uuid protobufjs fast-jwt undici --all`: `next@16.2.4`, `uuid@13.0.2`, `protobufjs@7.5.6`, `fast-jwt@6.2.4`, `undici@7.25.0`
  - `npm run security:deps`: 成功。high=0 / critical=0
  - `npm audit --omit=dev --audit-level=high`: 成功。Next同梱 `postcss@8.4.31` にmoderate 2件は残る
  - `npm run build`: 成功
  - `npm test`: 成功。132 tests pass
- [x] 2026-05-06: 保守性監査メモを作成
  - [`../prelaunch-maintainability-audit.md`](../prelaunch-maintainability-audit.md)
- [x] 2026-05-06: docs入口とmaintenance文書の初回構成を追加
