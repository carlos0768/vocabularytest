# KOMOJU Billing Specification

Last Updated: 2026-02-09
Owner: Backend / Subscription
Applies To: `src/app/api/subscription/*`, `src/lib/subscription/*`, `src/lib/komoju/*`

## 1. Goal

この仕様は、以下の決済事故を防ぐための正式ドキュメントである。

- 決済成功したのにPro反映されない
- 決済失敗したのに待機画面から抜けない
- Webhook/reconcile同時実行で二重処理される
- 後続開発で意図せず反映保証を壊す

本ドキュメントを基準仕様とし、課金関連改修はここに追記する。

## 2. Non-goals

- アプリ内解約機能の提供（`CANCELLATION_DISABLED` を維持）
- 料金体系の変更
- UIデザイン刷新

## 3. Architecture Overview

### 3.1 Paths

- `create`: `POST /api/subscription/create`
- `webhook`: `POST /api/subscription/webhook`
- `reconcile`: `GET /api/subscription/reconcile?session_id=...`
- `me`: `GET /api/subscription/me`
- client confirmation: `/subscription/success`

### 3.2 Reliability principle

- **Primary**: Webhook (`payment.captured` / `subscription.captured`) で反映
- **Fallback**: `reconcile` が同じ活性化関数 `activateBillingFromSession` を呼んで回復
- **Concurrency guard**: `claim_subscription_session` RPC が同一セッションの同時処理を制御

## 4. Environment Variables

必須:

- `KOMOJU_SECRET_KEY`
- `KOMOJU_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`（return/cancel URL 生成）

不整合時の典型症状:

- `KOMOJU_WEBHOOK_SECRET` 不一致: webhook 401 / 反映ゼロ
- `NEXT_PUBLIC_APP_URL` 不正: return URL と運用導線が崩れる

## 5. Data Model Contract

## 5.1 `subscriptions`

- `status`, `plan`
- `pro_source`: `billing | test | none`
- `komoju_customer_id`
- `komoju_subscription_id`
- `current_period_start`, `current_period_end`
- `cancel_at_period_end`, `cancel_requested_at`

制約:

- `komoju_subscription_id` 非NULL一意
- `komoju_customer_id` 非NULL一意
- `pro_source='billing'` は live `komoju_subscription_id` 必須

## 5.2 `subscription_sessions`

- `id` (KOMOJU session id)
- `user_id`, `plan_id`, `idempotency_key`
- `used_at`
- `status`: `pending | succeeded | failed | cancelled`
- `failure_code`, `failure_message`
- `last_event_type`
- `processing_started_at`, `updated_at`

## 5.3 `webhook_events`

- `id`, `type`, `status`
- `attempt_count`
- `payload_hash`
- `processed_at`, `last_error`, `updated_at`

## 6. API Behavior Contract

## 6.1 `POST /api/subscription/create`

責務:

- 既存Pro判定
- `subscription_sessions` の fresh pending を見て idempotency key を再利用
- KOMOJUセッション作成
- `subscription_sessions` に `status='pending'` で記録

KOMOJU request requirements:

- `mode: customer_payment`
- `email`
- `customer_id`（既存時のみ）
- headers: `X-KOMOJU-IDEMPOTENCY`, `Idempotency-Key`
- metadata minimum:
  - `user_id`
  - `plan='pro'`
  - `plan_id`
  - `idempotency_key`

## 6.2 `POST /api/subscription/webhook`

冪等処理:

- `claim_webhook_event` で処理権を獲得
- 処理成功: `webhook_events.status='processed'`
- 処理失敗: `webhook_events.status='failed'`, `last_error`

イベント別処理:

- `payment.captured`
  - `activateBillingFromSession` を実行
- `subscription.captured`
  - 既存 `komoju_subscription_id` 行があれば期間更新
  - なければ session 解決して bootstrap activate
- `payment.failed|cancelled|canceled|expired`
  - 対応 session を `failed` へ更新
- `payment.refunded`
  - サブスクを `cancelled` へ更新
- `subscription.canceled|cancelled`
  - 期間末解約または即時解約を反映

## 6.3 `GET /api/subscription/reconcile`

戻り値 `state`:

- `confirmed`: 反映完了
- `pending`: まだ確定不可
- `failed`: 決済失敗確定

`reason` は必須（例）:

- `already_active`
- `payment_confirmed`
- `payment_not_captured`
- `payment_failed`
- `activation_in_progress`
- `customer_not_ready`
- `session_cancelled`
- `komoju_session_fetch_failed`

判定ルール:

- captured系: `captured|completed|complete|paid` -> `confirmed`
- failed系: `failed|declined|expired|cancelled|canceled|rejected` -> `failed`
- それ以外 -> `pending`

## 6.4 `/subscription/success`

- `me` と `reconcile` をポーリング
- `confirmed` -> 完了UI
- `failed` -> 失敗UI + `/subscription` 再試行導線
- タイムアウト -> 遅延UI + 手動再確認

## 7. Activation Core (`activateBillingFromSession`)

入力優先順位:

- `subscriptionIdFromEvent`
- `session.komoju_subscription_id`
- `subscriptions.komoju_subscription_id`
- （未決定なら）`createSubscription`

顧客ID解決順:

- 引数のイベント由来 customer id
- session row の `komoju_customer_id`
- metadata customer id
- KOMOJU session 再取得 (`customer_id`, `customer`, `payment.customer`, `payment.customer_id`)

同時実行制御:

- `claim_subscription_session` 実行
- `in_progress` は `Activation in progress` で上位へ返す
- 成功時は `subscription_sessions.status='succeeded'` を保証

## 8. State Machine

## 8.1 `subscription_sessions`

- initial: `pending`
- success path: `pending -> succeeded`
- failure path: `pending -> failed`
- cancel path: `pending -> cancelled`

禁止事項:

- `succeeded` から `failed` へ戻さない

## 8.2 `webhook_events`

- claim時: `processing`
- 正常終了: `processed`
- 異常終了: `failed`（再試行対象）

## 9. Failure Card Scenarios (KOMOJU test mode)

対象カード:

- `4123111111111000` 残高不足
- `4123111111111018` 利用限度額超過
- `4123111111111034` セキュリティ番号不正
- `4123111111111042` 期限切れ
- `4123111111111059` カード使用不可
- `4123111111111067` 無効なカード

期待結果:

- `reconcile.state='failed'`
- `subscription_sessions.status='failed'`
- `subscriptions` は `active/pro/billing` に遷移しない
- `/subscription/success` は失敗UIへ遷移

## 10. Monitoring & Runbook

日次確認:

- `docs/komoju-monitoring.sql`
  - webhook failed count
  - stale processing webhook
  - failed session count
  - pending session > 15m
  - captured済み未billing候補

障害初動:

1. `webhook_events` の `failed` と `last_error` を確認
2. 対象 `subscription_sessions` の `status/failure_code/last_event_type` を確認
3. `subscriptions` の `pro_source` と `current_period_end` を確認
4. 必要なら該当 session_id で `reconcile` を手動実行して回復可否を確認

## 11. Test Requirements

必須テスト:

- `src/lib/subscription/billing-activation.test.ts`
  - subscription id優先順位
  - customer id抽出順
- `src/lib/subscription/reconcile-status.test.ts`
  - captured/failed/pending分類
- 既存テスト一式 + `npx tsc --noEmit`

## 12. Change Management Rules

- 課金ロジック変更時は本書の「Architecture/Data Model/API/State Machine/Monitoring」を同時更新すること。
- `reason` の語彙を増やした場合、`/subscription/success` と本書へ追記すること。
- 重大障害が発生した場合は `docs/ops-komoju-incident-YYYY-MM-DD.md` を追加すること。
