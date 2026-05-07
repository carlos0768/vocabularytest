# AI Handoff

AIがこのリポジトリで作業する時は、最初にこのファイルを読んで現在の方針を復元してください。

## 現在の最優先方針

公開前は、大規模リファクタよりも「公開後に安全に直し続けられる足場」を優先します。

優先順:

1. lint / build / test の検証基盤整理
2. docsの入口と運用Runbook整備
3. 作成済みのアーキテクチャ保守性監査を読み、API構成、責務分離、巨大ファイル、危険領域の依存関係を把握する
4. P2-Bの [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) を読み、contract/test/検証条件を固定した小タスク単位でP2-Cを進める
5. 巨大ファイル分割は、計画内の最初の3回分を終えた後に段階的に実施する

## 必ず読む文書

作業前:

1. [`../README.md`](../README.md)
2. このファイル
3. [`../boundaries.md`](../boundaries.md)
4. [`../invariants.md`](../invariants.md)
5. P2-B/P2-Cや危険領域を扱う場合は [`ARCHITECTURE_MAINTAINABILITY_AUDIT.md`](ARCHITECTURE_MAINTAINABILITY_AUDIT.md)
6. P2-Cへ入る場合は [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md)
7. 触る領域のrunbookまたは関連docs

作業後:

- 進捗が変わったら [`TASKS.md`](TASKS.md) を更新
- 方針判断が増えたら [`DECISIONS.md`](DECISIONS.md) を更新
- 恒久化すべき知識は正式docsへ昇格する候補として `TASKS.md` に残す

## 現在分かっている危険領域

特に注意する領域:

- 課金: `src/app/api/subscription/`, `src/lib/subscription/`, `src/lib/stripe/`
- スキャン: `src/app/api/extract/`, `src/app/api/scan-jobs/`, `src/lib/ai/`
- 認証: `src/hooks/use-auth.ts`, `src/app/api/auth/`, `src/lib/supabase/`
- 同期: `src/lib/db/hybrid-repository.ts`, `src/lib/db/sync-queue.ts`
- DB: `supabase/migrations/`, `shared/types/index.ts`, `shared/db/mappers.ts`
- PWA/offline: `public/sw.js`, `src/lib/offline/`, `src/components/pwa/`

危険領域を変更する場合は、必ず [`../boundaries.md`](../boundaries.md) と [`../invariants.md`](../invariants.md) を確認してください。

## 現在の検証状態

2026-05-07時点の検証結果:

- `npm run build`: 成功
- `npm test`: 成功。219 tests pass。Web/shared通常testの固定リストを実行。固定リストは自動発見ではなく、通過確認済みtestだけを含める
- `npm run test:security`: 成功。38 tests pass。SQL guard tests、secrets guard tests、API route security testsを実行
- `npm run lint:web`: 成功。0 errors / 98 warnings
- `npm run verify`: 成功。`lint:web`, `security:all`, `npm test`, `test:security`, `build` を実行
- `npm run test:cloud-run-scan`: 成功。22 tests pass。Cloud Run scan serviceは別packageなので root Web `verify` には含めない
- `npm run lint`: 公開前gateではない。Web本体公開前検証には `npm run lint:web` / `npm run verify` を使う
- `npx tsc --noEmit`: 失敗
- `npm run security:secrets`: 成功。violations 0
- `npm run security:all`: 成功
- `npm run security:deps`: 成功。high=0 / critical=0
- `npm audit --omit=dev --audit-level=high`: 成功。Next同梱 `postcss@8.4.31` にmoderate 2件は残る
- README/CLAUDE/architecture/commands/runbooks/.env.example/vercel.json の古い課金・Sentry・migration数・grammar route記述は 2026-05-06 に実装へ同期済み
- docsの矛盾一覧は 2026-05-07 に [`DOCS_CONSISTENCY_AUDIT.md`](DOCS_CONSISTENCY_AUDIT.md) として作成済み
- docs整合性監査で公開前に直す候補だった `docs/boundaries.md` のmigration数と `docs/ops/scan-example-sentences-runbook.md` のrepo外絶対リンクは 2026-05-07 に修正済み
- docs整合性監査で実装確認が必要な候補: Supabase RLS表現差分、Cloud Run本番env、App Store / IAP外部設定
- P2-A アーキテクチャ保守性監査は 2026-05-07 に [`ARCHITECTURE_MAINTAINABILITY_AUDIT.md`](ARCHITECTURE_MAINTAINABILITY_AUDIT.md) として作成済み。API route/server action/repository責務、巨大ファイル5本、危険領域依存関係、データ流れ/復旧点、リファクタ優先度を整理済み
- P2-B リファクタ計画は 2026-05-07 に [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) として作成済み。P2-Aの優先度表をそのまま実装順にせず、scan job contract testを最初に置く
- `docs/ops/` のスキャン失敗、Stripe課金反映失敗、ログイン/認証失敗の日本語初動Runbookは 2026-05-07 に追加済み
- `docs/ops/` のSupabase接続障害 / migration事故、AIコスト急増、本番環境変数チェックリストは 2026-05-07 に追加済み
- テスト固定リスト方式は 2026-05-07 に整理済み。`npm test` は通過確認済みのWeb/shared通常test固定リスト、`npm run test:security` はsecurity guard/route tests、`npm run test:cloud-run-scan` は別packageのCloud Run tests
- 固定リストから除外していた `src/lib/supabase/session-cache.test.ts` と `src/app/api/shared-projects/shared.test.ts` は、本体仕様変更なしで現行期待値へ同期し、2026-05-07 に `npm run test:web` へ復帰済み
- P2-C Task 1は 2026-05-07 に完了。`src/app/api/scan-jobs/process/route.contract.test.ts` を追加し、pending claim、already processed、valid UUIDのmissing job、`client_local` result payload、example生成失敗warning、completed通知を固定済み。worker auth 401、non-uuid `jobId` 400、`INTERNAL_WORKER_TOKEN` 正規化は既存 `src/app/api/security/route.security.test.ts` で継続固定。`processJobById()` にはtest用の任意depsだけを追加し、未指定時のproduction behavior、HTTP self-fetch禁止、AI prompt、post-processing、通知/timing、認証、課金、同期、DB migrationは変更していない
- P2-C Task 2は 2026-05-07 に完了。`src/lib/scan/mode-provider.ts` を追加し、`/api/extract` と `/api/scan-jobs/process` のprovider mapping / missing key判定を共通化済み。`all` / `circled` / `eiken` / `idiom` は既存 `AI_CONFIG.extraction.*.provider` へのmappingを維持し、Cloud Run設定時はdirect provider key missingを返さない。HTTP境界、usage increment、AI抽出呼び出し、Cloud Run fallback、prompt、認証、課金、同期、DB migrationは変更していない。`src/lib/scan/mode-provider.test.ts` を `npm run test:web` 固定リストへ追加済み
- P2-C Task 3は 2026-05-07 に完了。`src/lib/scan/job-create-contract.ts` を追加し、`/api/scan-jobs/create` とlegacy `/api/scan-jobs` の `clientPlatform` / Pro状態からの `save_mode` 判定を共通化済み。webはPro/freeとも `server_cloud`、iOS/Android freeは `client_local`、iOS/Android Proは `server_cloud`、legacy routeの `clientPlatform` 正規化、uploaded image存在確認がusage incrementより前にあること、missing uploaded image 400、Pro-only mode 403、usage limit 429、`after(processJobById)` 直接呼び出しを `src/app/api/scan-jobs/create/route.contract.test.ts` で固定済み。`checkAndIncrementScanUsage()` の呼び出しタイミング、Storage bucket名、uploaded file existence check、target project ownership check、`scan_jobs` insert payload、`after(processJobById)` の直接呼び出し、認証、課金、同期、DB migrationは変更していない。新contract testを `npm run test:web` 固定リストへ追加済み
- P2-C Task 5は 2026-05-07 に完了。`src/lib/scan/job-result-payload.ts` を追加し、`/api/scan-jobs/process` の `client_local` 完了時に `scan_jobs.result` へ保存するpayload object作成を `buildClientLocalScanJobResultPayload()` へ移動済み。`wordCount`, `saveMode`, `extractedWords`, `sourceLabels`, `lexiconEntries`, `warnings`, `exampleGeneration`、warningなし / `exampleGeneration` なしの場合のpayload shape、空 `lexiconEntries` を `src/lib/scan/job-result-payload.test.ts` で固定済み。`scan_jobs.update({ status: 'completed' })` の実行場所、DB update payloadの意味、AI抽出呼び出し、example generation呼び出し、通知、timing flush、post-processing `after()`、server_cloud保存、認証、課金、同期、DB migration、prompt文言は変更していない。新helper testを `npm run test:web` 固定リストへ追加済み
- P2-C Task 6は 2026-05-07 に完了。`src/lib/scan/server-cloud-persistence.ts` と `src/lib/scan/server-cloud-persistence.contract.test.ts` を追加し、`server_cloud` 保存時の新規project insert payload、既存project sourceLabels merge、words insert payload、words保存失敗時rollback条件を固定済み。新規project作成後にwords保存が失敗した時だけ新規projectを削除し、既存project追加時は削除しない条件をhelper testで固定。`/api/scan-jobs/process` はpayload/条件builderを呼ぶだけに留め、Supabase insert/update/deleteの順序、DB保存処理本体、通知、timing、AI生成、post-processing、認証、課金、同期、DB migrationは変更していない。新contract testを `npm run test:web` 固定リストへ追加済み

詳細は [`../prelaunch-maintainability-audit.md`](../prelaunch-maintainability-audit.md) を参照してください。

## 作業ルール

- 既存docsは初回では移動・削除・改名しない。
- 既存文書の古い記述は、見つけたらまず [`TASKS.md`](TASKS.md) に積む。
- `maintenance/` は工事中の一時情報。恒久情報は正式docsへ昇格させる。
- 過去のmigrationファイルは編集しない。DB変更は新しいmigrationで行う。
- コード変更後は、変更範囲に応じて `npm run build`, `npm test`, security checkを実行する。
- 検証できなかった場合は、理由と残リスクを明記する。

## 次にやるべき作業

1. P2-C Task 6まで完了済み。`scan-jobs/process` を続ける場合は [`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) のTask 7「notification / timing adapterをscan処理から切り出す」へ進む。未実施のTask 4 `/api/extract` route contractも残っている
2. `scan-jobs/process` の分割は、1回1責務でcontract/testを先に固定し、DB状態遷移、通知、timing、post-processingの順序を無自覚に動かさない
3. P2-C以降も、認証、課金、スキャン、同期、DB migrationを同時に触らない
