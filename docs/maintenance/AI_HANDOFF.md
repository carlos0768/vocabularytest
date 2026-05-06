# AI Handoff

AIがこのリポジトリで作業する時は、最初にこのファイルを読んで現在の方針を復元してください。

## 現在の最優先方針

公開前は、大規模リファクタよりも「公開後に安全に直し続けられる足場」を優先します。

優先順:

1. lint / build / test の検証基盤整理
2. docsの入口と運用Runbook整備
3. テスト固定リスト方式とdocs矛盾一覧の整理
4. 巨大ファイル分割は公開後に段階的に実施

## 必ず読む文書

作業前:

1. [`../README.md`](../README.md)
2. このファイル
3. [`../boundaries.md`](../boundaries.md)
4. [`../invariants.md`](../invariants.md)
5. 触る領域のrunbookまたは関連docs

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
- `npm test`: 成功。132 tests pass
- `npm run lint:web`: 成功。0 errors / 98 warnings
- `npm run verify`: 成功
- `npm run lint`: 公開前gateではない。Web本体公開前検証には `npm run lint:web` / `npm run verify` を使う
- `npx tsc --noEmit`: 失敗
- `npm run security:secrets`: 成功。violations 0
- `npm run security:all`: 成功
- `npm run security:deps`: 成功。high=0 / critical=0
- `npm audit --omit=dev --audit-level=high`: 成功。Next同梱 `postcss@8.4.31` にmoderate 2件は残る
- README/CLAUDE/architecture/commands/runbooks/.env.example/vercel.json の古い課金・Sentry・migration数・grammar route記述は 2026-05-06 に実装へ同期済み
- `docs/ops/` のスキャン失敗、Stripe課金反映失敗、ログイン/認証失敗の日本語初動Runbookは 2026-05-07 に追加済み
- `docs/ops/` のSupabase接続障害 / migration事故、AIコスト急増、本番環境変数チェックリストは 2026-05-07 に追加済み

詳細は [`../prelaunch-maintainability-audit.md`](../prelaunch-maintainability-audit.md) を参照してください。

## 作業ルール

- 既存docsは初回では移動・削除・改名しない。
- 既存文書の古い記述は、見つけたらまず [`TASKS.md`](TASKS.md) に積む。
- `maintenance/` は工事中の一時情報。恒久情報は正式docsへ昇格させる。
- 過去のmigrationファイルは編集しない。DB変更は新しいmigrationで行う。
- コード変更後は、変更範囲に応じて `npm run build`, `npm test`, security checkを実行する。
- 検証できなかった場合は、理由と残リスクを明記する。

## 次にやるべき作業

1. テスト固定リスト方式を見直す
2. docsの矛盾一覧を作る
