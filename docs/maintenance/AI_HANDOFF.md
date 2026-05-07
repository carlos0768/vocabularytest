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
- `npm test`: 成功。200 tests pass。Web/shared通常testの固定リストを実行。固定リストは自動発見ではなく、通過確認済みtestだけを含める
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

詳細は [`../prelaunch-maintainability-audit.md`](../prelaunch-maintainability-audit.md) を参照してください。

## 作業ルール

- 既存docsは初回では移動・削除・改名しない。
- 既存文書の古い記述は、見つけたらまず [`TASKS.md`](TASKS.md) に積む。
- `maintenance/` は工事中の一時情報。恒久情報は正式docsへ昇格させる。
- 過去のmigrationファイルは編集しない。DB変更は新しいmigrationで行う。
- コード変更後は、変更範囲に応じて `npm run build`, `npm test`, security checkを実行する。
- 検証できなかった場合は、理由と残リスクを明記する。

## 次にやるべき作業

1. P2-Cとして、[`REFACTOR_PLAN.md`](REFACTOR_PLAN.md) の「最初の3回分の実行計画」を順番に進める
2. 次回は2回目としてTask 2「scan mode / provider選択helperを共通化する」だけを行い、provider mapping以外のproduction behaviorを変えない
3. P2-C以降も、認証、課金、スキャン、同期、DB migrationを同時に触らない
