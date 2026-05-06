# Operations Docs

運用・障害対応に関する文書の入口です。公開後に障害が起きた時は、まず該当runbookを探し、なければ [`../maintenance/TASKS.md`](../maintenance/TASKS.md) に不足として追加します。

## 既存Runbook

| 文書 | 用途 |
|---|---|
| [`scan-failure-runbook.md`](scan-failure-runbook.md) | スキャン失敗 / 遅延の初動対応 |
| [`billing-stripe-failure-runbook.md`](billing-stripe-failure-runbook.md) | Stripe課金反映失敗の初動対応 |
| [`login-auth-failure-runbook.md`](login-auth-failure-runbook.md) | ログイン / 認証失敗の初動対応 |
| [`scan-gemini-cloudrun-runbook.md`](scan-gemini-cloudrun-runbook.md) | Cloud Run経由のGeminiスキャン抽出の運用 |
| [`scan-example-sentences-runbook.md`](scan-example-sentences-runbook.md) | スキャン後の例文生成トラブルシュート |
| [`nightly-lexicon-cron-runbook.md`](nightly-lexicon-cron-runbook.md) | Nightly Master Lexicon Cronの復旧手順 |
| [`../runbooks.md`](../runbooks.md) | 主要運用Runbookの親文書 |
| [`../ops-auto-pro-first-66-2026-04-04.md`](../ops-auto-pro-first-66-2026-04-04.md) | 初期66人自動Proキャンペーンの運用メモ |
| [`../ops-manual-pro-activation-2026-03-09.md`](../ops-manual-pro-activation-2026-03-09.md) | 手動Pro付与の運用メモ |
| [`../ops-komoju-incident-2026-02-09.md`](../ops-komoju-incident-2026-02-09.md) | 過去のKOMOJU決済反映障害メモ |

## 公開前に追加したいRunbook

以下はまだ不足している運用手順です。作成状況は [`../maintenance/TASKS.md`](../maintenance/TASKS.md) で管理します。スキャン失敗、Stripe課金反映失敗、ログイン失敗は上記の初動Runbookを参照してください。

- Supabase接続障害 / migration事故
- AIコスト急増
- 本番環境変数チェックリスト

## 運用時の基本ルール

- 課金、認証、スキャン、同期、DBを触る前に [`../boundaries.md`](../boundaries.md) と [`../invariants.md`](../invariants.md) を読む。
- 古いKOMOJU資料は履歴として有用だが、現在のWeb課金実装はStripe中心で確認する。
- Sentryは現在未使用。`src/instrumentation.ts` と `src/instrumentation-client.ts` はno-opで、`@sentry/nextjs` は未導入。
- 障害対応で新しい知見が出たら、該当runbookへ追記する。恒久化前のメモは `../maintenance/` に残す。
