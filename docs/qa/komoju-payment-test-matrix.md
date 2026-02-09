# KOMOJU Payment Test Matrix

Last Updated: 2026-02-09
Scope: `/api/subscription/create`, `/api/subscription/webhook`, `/api/subscription/reconcile`, `/subscription/success`

## Pre-check

1. `subscription_sessions` に最新レコードが `status='pending'` で作成されること。
2. KOMOJU webhook URL が `POST /api/subscription/webhook` を指していること。
3. `KOMOJU_WEBHOOK_SECRET` が test mode の値と一致していること。

## Success scenario

Card:
- `4111111111111111`

Expected:
- `/subscription/success` が最終的に成功画面になる。
- `subscriptions` が `status='active'`, `plan='pro'`, `pro_source='billing'`。
- `subscription_sessions.status='succeeded'`。
- `webhook_events` に `payment.captured` または `subscription.captured` が `processed` で残る。

## Failure scenarios

Cards:
- `4123111111111000` 残高不足
- `4123111111111018` 利用限度額超過
- `4123111111111034` セキュリティ番号不正
- `4123111111111042` 期限切れ
- `4123111111111059` カード使用不可
- `4123111111111067` 無効なカード

Expected (all cases):
- `/subscription/success` が最終的に失敗画面になる。
- `subscriptions` が `active/pro/billing` にならない。
- `subscription_sessions.status='failed'`。
- `subscription_sessions.failure_code` または `failure_message` が保存される。
- `reconcile` が `state='failed'` / `reason='payment_failed'` を返す。

## SQL checks

```sql
-- latest 20 sessions
select id, user_id, status, failure_code, failure_message, last_event_type, created_at, updated_at
from public.subscription_sessions
order by created_at desc
limit 20;

-- latest 20 billing subscriptions
select user_id, status, plan, pro_source, komoju_subscription_id, current_period_end, updated_at
from public.subscriptions
order by updated_at desc
limit 20;

-- latest 50 webhook events
select id, type, status, attempt_count, last_error, updated_at
from public.webhook_events
order by updated_at desc
limit 50;
```

## Incident criteria

以下のどれかを満たしたら incident 扱い:

- 決済成功なのに `subscriptions.pro_source='billing'` へ遷移しない
- 失敗カードなのに `subscription_sessions.status='failed'` へ遷移しない
- success 画面が `pending` のまま 20 回ポーリング後も復帰しない

対応:

1. `docs/komoju-monitoring.sql` のクエリを実行
2. `docs/ops-komoju-incident-YYYY-MM-DD.md` を作成して時系列記録
3. `webhook_events.last_error` と Vercel ログを突合
