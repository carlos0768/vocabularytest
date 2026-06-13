# Operations Docs

運用・障害対応に関する文書の入口です。公開後に障害が起きた時は、まず該当runbookを探し、なければ [`../maintenance/TASKS.md`](../maintenance/TASKS.md) に不足として追加します。

## 既存Runbook

| 文書 | 用途 |
|---|---|
| [`release-acceptance-criteria.md`](release-acceptance-criteria.md) | 初回一般公開 v1.0 を「公開できる」と判断するための固定基準 |
| [`production-readiness-audit-2026-06-13.md`](production-readiness-audit-2026-06-13.md) | 2026-06-13時点の公開可否監査、P0/P1、検証結果 |
| [`production-operations-handbook.md`](production-operations-handbook.md) | 公開後に運用者が毎日・毎週・障害時に見るべき情報の教科書 |
| [`gcp-billing-safety-audit-2026-06-13.md`](gcp-billing-safety-audit-2026-06-13.md) | GCP高額請求防止の公式docs照合と本番guardrail |
| [`../maintenance/PRELAUNCH_RELEASE_CHECKLIST.md`](../maintenance/PRELAUNCH_RELEASE_CHECKLIST.md) | 初版公開前の最終チェック、手動QA、外部サービス確認 |
| [`scan-failure-runbook.md`](scan-failure-runbook.md) | スキャン失敗 / 遅延の初動対応 |
| [`billing-stripe-failure-runbook.md`](billing-stripe-failure-runbook.md) | Stripe課金反映失敗の初動対応 |
| [`login-auth-failure-runbook.md`](login-auth-failure-runbook.md) | ログイン / 認証失敗の初動対応 |
| [`supabase-incident-runbook.md`](supabase-incident-runbook.md) | Supabase接続障害 / migration事故の初動対応 |
| [`ai-cost-spike-runbook.md`](ai-cost-spike-runbook.md) | AIコスト急増の初動対応 |
| [`production-env-checklist.md`](production-env-checklist.md) | 本番環境変数の公開前 / 障害時チェックリスト |
| [`scan-gemini-cloudrun-runbook.md`](scan-gemini-cloudrun-runbook.md) | Cloud Run経由のGeminiスキャン抽出の運用 |
| [`scan-example-sentences-runbook.md`](scan-example-sentences-runbook.md) | スキャン後の例文生成トラブルシュート |
| [`nightly-lexicon-cron-runbook.md`](nightly-lexicon-cron-runbook.md) | Nightly Master Lexicon Cronの復旧手順 |
| [`../runbooks.md`](../runbooks.md) | 主要運用Runbookの親文書 |
| [`../ops-auto-pro-first-66-2026-04-04.md`](../ops-auto-pro-first-66-2026-04-04.md) | 廃止済み初期66人自動Proキャンペーンの運用メモ |
| [`../ops-manual-pro-activation-2026-03-09.md`](../ops-manual-pro-activation-2026-03-09.md) | 手動Pro付与の運用メモ |
| [`../ops-komoju-incident-2026-02-09.md`](../ops-komoju-incident-2026-02-09.md) | 過去のKOMOJU決済反映障害メモ |

## 運用時の基本ルール

- 初版公開前は [`release-acceptance-criteria.md`](release-acceptance-criteria.md) を正とし、実メール、代表scan、Supabase、Resend、Cloud Run、AI costの確認漏れを分ける。v1.0 は課金導線を公開しないため、Stripe live確認は課金公開リリース時に行う。
- 課金、認証、スキャン、同期、DBを触る前に [`../boundaries.md`](../boundaries.md) と [`../invariants.md`](../invariants.md) を読む。
- 古いKOMOJU資料は履歴として有用だが、課金公開時のWeb課金実装はStripe中心で確認する。
- Sentryは現在未使用。`src/instrumentation.ts` と `src/instrumentation-client.ts` はno-opで、`@sentry/nextjs` は未導入。
- 障害対応で新しい知見が出たら、該当runbookへ追記する。恒久化前のメモは `../maintenance/` に残す。
