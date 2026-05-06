# Maintenance Tasks

公開前の保守性向上工事で追うタスク一覧です。完了したものは日付つきでDoneへ移すか、`_archive/` に退避します。

## P0: 公開前に必ず終わらせる

現時点で未完了のP0はありません。

## P1: 公開前にできれば終わらせる

- [ ] `docs/ops/` に日本語の障害対応Runbookを追加する
  - スキャン失敗
  - 課金反映失敗
  - ログイン失敗
  - Supabase障害
  - AIコスト急増
- [ ] 本番環境変数チェックリストを作る
  - Vercel
  - Supabase
  - Stripe
  - Cloud Run
  - Apple IAP
  - Push通知
- [ ] テスト実行方式を見直す
  - 現状: `package.json` の `test` script は固定リスト
  - 課題: repo内に存在するが固定リストに入っていないtestがある
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
