# Maintenance Tasks

公開前の保守性向上工事で追うタスク一覧です。完了したものは日付つきでDoneへ移すか、`_archive/` に退避します。

## P0: 公開前に必ず終わらせる

現時点で未完了のP0はありません。

## P1: 公開前にできれば終わらせる

現時点で未完了のP1はありません。

## P2: 保守可能な構造へ段階的に進める

P2は「巨大ファイルをいきなり分割する作業」ではなく、公開後もAIと人間が安全に変更を続けられる構造へ近づけるための保守性工事です。最初に全体構造を監査し、次に小さな実装タスクへ分解し、最後に検証しながら段階的に直します。

### P2-A: アーキテクチャ保守性監査

- 成果物: [`ARCHITECTURE_MAINTAINABILITY_AUDIT.md`](ARCHITECTURE_MAINTAINABILITY_AUDIT.md)

- [x] API route / server action / repository層の責務一覧を作る
  - どのAPIが認証、課金、スキャン、同期、DB更新、外部サービス呼び出しを担当しているかを棚卸しする
  - API routeが直接持ちすぎている責務と、lib/repository層へ寄せるべき責務を分ける
- [x] 巨大ファイルの責務マップを作る
  - 対象候補: `src/app/api/scan-jobs/process/route.ts`, `src/app/page.tsx`, `src/app/project/[id]/page.tsx`, `src/app/quiz/[projectId]/page.tsx`, `src/lib/ai/prompts.ts`
  - 先に「何を担当しているか」「どこを触ると何が壊れやすいか」を文書化し、分割作業はその後に行う
- [x] 認証、課金、スキャン、同期、DB migrationの依存関係を図解または一覧化する
  - 障害時に見るべきテーブル、env、外部サービス、runbookを紐づける
  - 公開後にAIへ依頼する時の「触ってよい境界」と「慎重に扱う境界」を明確にする
- [x] データの流れと失敗時の復旧点を整理する
  - 例: スキャン開始から画像保存、Cloud Run、DB保存、利用回数更新まで
  - 例: Stripe checkoutからwebhook、subscription反映、reconcileまで
- [x] リファクタ優先度を、リスク、変更頻度、ユーザー影響、テスト有無で決める

### P2-B: リファクタ計画

- 成果物: [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md)

- [x] 監査結果をもとに、小さな作業単位へ分解する
  - 1タスクで1つの責務だけを動かす
  - 認証、課金、スキャン、同期、DB migrationを同時に触る作業を避ける
- [x] 各リファクタに検証条件を書く
  - 実行するnpm script、手動確認、関連runbook、失敗時の戻し方を明記する
- [x] 分割後の置き場所と命名ルールを決める
  - API routeは薄くし、複雑な処理は既存の `src/lib/` / repository層 / service相当の置き場所へ寄せる
  - 新しい抽象化は、重複削減か責務分離の効果が明確な場合だけ追加する
- [x] AI作業用のプロンプト雛形を作る
  - 作業前に読むdocs、触ってよい範囲、禁止事項、検証コマンド、TASKS更新ルールを固定する

### P2-C: 段階的リファクタ

- [x] 2026-05-07: Task 1 `scan job process contract testを追加する`
  - 追加: `src/app/api/scan-jobs/process/route.contract.test.ts`
  - 固定: `pending` job claimの `status='processing'` update + `eq('status','pending')` 条件、already completed jobの再処理なし、valid UUIDだが行がないjobの404、`client_local` completed payload、example生成失敗時の `example_generation_failed` warning / `exampleGeneration` summary、completed通知
  - 既存testで継続固定: worker auth 401、non-uuid `jobId` 400、`INTERNAL_WORKER_TOKEN` 正規化
  - 変更: `processJobById()` にtest用の任意depsを追加。未指定時は既存のSupabase singleton、AI抽出、example生成、通知、timingを使うためproduction behaviorは変更しない
  - 変更なし: `processJobById()` のDB更新順、status遷移、post-processing `after()`、通知送信条件、timing log、AI prompt、HTTP self-fetch、認証、課金、同期、DB migration
- [x] 2026-05-07: Task 2 `scan mode / provider選択helperを共通化する`
  - 追加: `src/lib/scan/mode-provider.ts`, `src/lib/scan/mode-provider.test.ts`
  - 共通化: `/api/extract` と `/api/scan-jobs/process` の `getProvidersForMode()` / `getMissingProviderKey()` 相当をhelperへ移動
  - 固定: `all` / `circled` / `eiken` / `idiom` は既存 `AI_CONFIG.extraction.*.provider` へmapping、Cloud Run設定時はdirect provider key missingを返さない、Cloud Run未設定時は不足しているconfigured provider keyを返す
  - 変更: `src/app/api/extract/route.provider.test.ts` と `src/app/api/scan-jobs/process/route.extractor.test.ts` のprovider helper参照先を `src/lib/scan/mode-provider.ts` へ更新し、`src/lib/scan/mode-provider.test.ts` を `npm run test:web` 固定リストへ追加
  - 変更なし: auth、usage increment、AI抽出呼び出し、Cloud Run fallback、`ExtractMode` の値、`AI_CONFIG` の意味、prompt、認証、課金、同期、DB migration
- [ ] `src/app/api/scan-jobs/process/route.ts` を、監査結果に基づいて段階的に分割する
- [ ] `src/app/page.tsx` を、画面責務と状態管理の境界を確認してから段階的に分割する
- [ ] `src/app/project/[id]/page.tsx` を、データ取得、表示、操作の責務を確認してから段階的に分割する
- [ ] `src/app/quiz/[projectId]/page.tsx` を、クイズ進行、保存、表示の責務を確認してから段階的に分割する
- [ ] `src/lib/ai/prompts.ts` を、用途別の責務と呼び出し元を確認してから整理する
- [ ] repository層、認証、課金、同期は、監査で問題が明確になった箇所から小さく直す

### P2-D: 正式docsへの昇格

- [ ] P2-A/P2-Bで得た恒久知識を `docs/architecture.md`, `docs/boundaries.md`, `docs/invariants.md`, `docs/ops/` へ反映する
- [ ] docs内のローカル絶対パスとline番号参照を相対表記へ寄せる
  - `docs/commands.md`, `docs/security/*.md`, `docs/runbooks.md` など
  - 公開前の挙動には影響しないため、正式docs整備の一部として扱う
- [ ] Supabase RLSのdocs差分をlive DB / migration / policy単位で再監査する
  - `docs/invariants.md` は監査済み、`docs/boundaries.md` は未確認としており、表現が割れている
  - 本番schema driftを含めて確認するまでは、実装確認なしに片方へ断定しない
- [ ] Cloud RunとApp Store / IAPの本番外部設定を確認する
  - Cloud RunはVercel envとCloud Run service envの一致を確認する
  - App Store / IAPはApp Store Connect、product id、Notifications V2到達を確認する

## Done

- [x] 2026-05-07: P2-C Task 2 scan mode / provider選択helperを共通化
  - 追加: `src/lib/scan/mode-provider.ts`, `src/lib/scan/mode-provider.test.ts`
  - 更新: `src/app/api/extract/route.ts`, `src/app/api/scan-jobs/process/route.ts`, `src/app/api/extract/route.provider.test.ts`, `src/app/api/scan-jobs/process/route.extractor.test.ts`, `package.json`, `docs/maintenance/TASKS.md`, `docs/maintenance/AI_HANDOFF.md`
  - 固定: `all` / `circled` / `eiken` / `idiom` のprovider mapping、Cloud Run設定時のdirect provider key missing抑制、Cloud Run未設定時のprovider key不足判定
  - 変更なし: auth、usage increment、AI抽出呼び出し、Cloud Run fallback、`ExtractMode` の値、`AI_CONFIG` の意味、prompt、認証、課金、同期、DB migration
  - 確認: `npm exec -- tsx --test src/app/api/extract/route.provider.test.ts src/app/api/scan-jobs/process/route.extractor.test.ts` 成功。8 tests pass
  - 確認: `npm exec -- tsx --test src/lib/scan/mode-provider.test.ts` 成功。4 tests pass
  - 確認: `npm run verify` 成功。`lint:web` は0 errors / 98 warnings、`security:all` 成功、`npm test` は204 tests pass、`test:security` は38 tests pass、`build` 成功
  - 次にやるべきこと: P2-C 3回目として、[`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) のTask 3「scan job create / legacy routeのsave mode contractを固定する」だけを実施する
- [x] 2026-05-07: P2-C Task 1 scan job process contract testを追加
  - 追加: `src/app/api/scan-jobs/process/route.contract.test.ts`
  - 更新: `src/app/api/scan-jobs/process/route.ts`, `package.json`, `docs/maintenance/TASKS.md`, `docs/maintenance/AI_HANDOFF.md`
  - 固定: pending claim、already processed、valid UUIDのmissing job、`client_local` result payload、example生成失敗warning、completed通知
  - 既存security testで確認: worker auth 401、non-uuid `jobId` 400、`INTERNAL_WORKER_TOKEN` 正規化
  - 変更なし: production behavior、HTTP self-fetch、AI prompt、DB migration、認証、課金、同期
  - 確認: `npm exec -- tsx --test src/app/api/scan-jobs/process/route.extractor.test.ts` 成功。5 tests pass
  - 確認: `npm exec -- tsx --test src/app/api/scan-jobs/process/route.contract.test.ts` 成功。4 tests pass
  - 確認: `npm run test:security` 成功。38 tests pass
  - 確認: `npm run verify` 成功。`lint:web` は0 errors / 98 warnings、`security:all` 成功、`npm test` は200 tests pass、`test:security` は38 tests pass、`build` 成功
  - 次にやるべきこと: P2-C 2回目として、[`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) のTask 2「scan mode / provider選択helperを共通化する」だけを実施する
- [x] 2026-05-07: P2-B リファクタ計画を作成
  - 追加: [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md)
  - 方針: いきなり巨大ファイルを分割せず、先にcontract/test/検証条件を固定する。認証、課金、スキャン、同期、DB migrationは同時に触らない
  - 優先順位: P2-Aの表では `scan-jobs/process` service boundaryがP1先頭だったが、実行順はscan job contract testを先頭に修正
  - 小タスク: scan process contract、scan provider helper、scan create save mode、extract route contract、client_local payload、server_cloud保存境界準備、notification/timing、Home/Project scan sessionStorage、Quiz helper、prompt contract、Stripe webhook、reconcile、Auth OTP、sync safety
  - 最初の3回: scan process contract test、scan mode/provider helper、background scan create save mode contractの順
  - 変更なし: code、巨大ファイル分割、機能追加、認証、課金、スキャン、同期、DB migration、過去migrationファイル
  - 確認: `git diff --check` 成功
  - 確認: `npm run verify` 成功。`lint:web` は0 errors / 98 warnings、`security:all` 成功、`npm test` は196 tests pass、`test:security` は38 tests pass、`build` 成功
- [x] 2026-05-07: P2-A アーキテクチャ保守性監査を作成
  - 追加: [`ARCHITECTURE_MAINTAINABILITY_AUDIT.md`](ARCHITECTURE_MAINTAINABILITY_AUDIT.md)
  - 棚卸し対象: `src/app/api`, server action有無、repository層、`src/lib`, `shared`, `supabase/migrations`
  - 整理: API route / repository責務、巨大ファイル5本の責務マップ、認証・課金・スキャン・同期・DB migrationの依存関係、データ流れと復旧点、リファクタ優先度
  - 変更なし: code、巨大ファイル分割、認証、課金、スキャン、同期、DB migration、過去migrationファイル
  - 確認: `git diff --check` 成功
  - 確認: `npm run verify` 成功。`lint:web` は0 errors / 98 warnings、`security:all` 成功、`npm test` は196 tests pass、`test:security` は38 tests pass、`build` 成功
  - 次にやるべきこと: P2-Cとして、[`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) の最初の3回分から段階的に実施する
- [x] 2026-05-07: P1 docs修正候補と固定リスト除外testを整理
  - `docs/boundaries.md` のmigration数を実態の76 filesへ同期
  - `docs/ops/scan-example-sentences-runbook.md` のrepo外絶対リンクを相対リンクへ修正
  - `src/lib/supabase/session-cache.test.ts` は本体実装を変えず、古い簡略user fixtureを現行 `parseUser()` が受け付けるSupabase `User` 相当fixtureへ同期
  - `src/app/api/shared-projects/shared.test.ts` は本体実装を変えず、現行metrics payloadの `likeCount: 0` 期待値へ同期
  - 上記2ファイルを `npm run test:web` 固定リストへ復帰
  - 変更なし: 認証、課金、スキャン、同期、DB migration、過去migrationファイル
  - 確認: `npm exec -- tsx --test src/lib/supabase/session-cache.test.ts` 成功。5 tests pass
  - 確認: `npm exec -- tsx --test src/app/api/shared-projects/shared.test.ts` 成功。8 tests pass
  - 確認: `npm test` 成功。196 tests pass
  - 確認: `npm run test:security` 成功。38 tests pass
  - 確認: `npm run verify` 成功。`lint:web` は0 errors / 98 warnings、`security:all` 成功、`npm test` は196 tests pass、`test:security` は38 tests pass、`build` 成功
  - 残リスク: P2のアーキテクチャ保守性監査、巨大ファイル分割、Supabase RLS / Cloud Run / App Store外部設定確認は未着手
- [x] 2026-05-07: docsの矛盾一覧を作成
  - 追加: [`DOCS_CONSISTENCY_AUDIT.md`](DOCS_CONSISTENCY_AUDIT.md)
  - 分類: 修正済みで問題なし / 履歴資料として意図的に残す / 古い可能性があるが公開前には影響が低い / 公開前に修正すべき / 実装確認が必要
  - 棚卸し対象: KOMOJU, Sentry, migration数, `npm run lint`, `npm test` 固定リスト, grammar route, Cloud Run, Stripe, App Store / IAP, Supabase RLS, Windowsパスや古いrepoパス
  - 実装確認: `package.json`, `.env.example`, `vercel.json`, `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/commands.md`, `docs/runbooks.md`, `docs/ops/README.md`, `src/instrumentation.ts`, `src/app/api/subscription/`, `src/lib/stripe/`, `src/lib/komoju/`, `src/lib/appstore/`
  - 公開前修正候補: `docs/boundaries.md` のmigration数、`docs/ops/scan-example-sentences-runbook.md` のrepo外絶対リンク
  - 実装確認が必要: Supabase RLSのdocs表現差分、Cloud Run本番env、App Store / IAP外部設定
  - 確認: `docs/maintenance/DOCS_CONSISTENCY_AUDIT.md` の存在確認、指定 `rg` 確認、`npm run verify` 成功
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
