# Stripe課金反映失敗 Runbook

## 目的

公開後にユーザーがStripeで支払ったのにProが反映されない、または課金状態が画面とDBで一致しない時、運用者が初動で切り分けるための手順です。

対象:

- Checkout作成: `/api/subscription/create`
- Stripe webhook: `/api/subscription/webhook`
- 成功画面の回復経路: `/api/subscription/reconcile`
- 状態取得: `/api/subscription/me`
- DB: `subscription_sessions`, `subscriptions`, `webhook_events`

現行Web課金はStripe中心です。KOMOJU資料は履歴資料として扱い、現行の初動判断にはStripe DashboardとStripe実装を優先してください。

## まず見る場所

- Stripe Dashboard
  - Checkout Sessions
  - Customers
  - Subscriptions
  - Payments / Invoices
  - Developers > Webhooks > Attempts
- Vercel Runtime Logs
  - `/api/subscription/create`
  - `/api/subscription/webhook`
  - `/api/subscription/reconcile`
  - `/api/subscription/me`
- Supabase Table / Logs
  - `subscription_sessions`
  - `subscriptions`
  - `webhook_events`
  - Auth users（対象メールから `user_id` を確認する場合）
- 参照docs
  - [`../subscription-policy.md`](../subscription-policy.md)
  - [`../runbooks.md`](../runbooks.md) のStripe webhook incident項目
  - [`../ops-komoju-incident-2026-02-09.md`](../ops-komoju-incident-2026-02-09.md) は履歴参考のみ

## よくある症状

- Stripeでは支払い済みなのに、アプリではFreeのまま。
- `/subscription/success` で確認中のまま進まない。
- `subscription_sessions.status='pending'` で `processing_started_at` が残ったまま。
- `webhook_events.status='failed'` が残っている。
- Stripe webhook attemptが 401 / 500 になっている。
- `/api/subscription/reconcile` が `pending` または `failed` を返す。
- 更新・解約・返金後の状態が画面に反映されない。

## 初動確認手順

1. ユーザーからメールアドレス、支払い日時、Stripe Checkout Session ID `cs_...` があるか確認する。
2. Stripe DashboardでCheckout Sessionを確認し、`payment_status='paid'`、`mode='subscription'`、Subscription ID `sub_...`、Customer ID `cus_...` を確認する。
3. Vercel Runtime Logsで同じ時間帯の `/api/subscription/create`、`/api/subscription/webhook`、`/api/subscription/reconcile` を確認する。
4. `subscription_sessions` に `id = cs_...` の行があるか確認する。
5. `subscriptions` で対象 `user_id` の `status`, `plan`, `pro_source`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_end` を確認する。
6. Stripe webhook attemptが失敗している場合、`webhook_events` の `status`, `last_error`, `type` を確認する。
7. Webhookが未反映でも、成功画面の `/api/subscription/reconcile` が成功していれば `subscription_sessions.status='succeeded'` と `subscriptions.pro_source='billing'` になります。
8. DBとStripeが矛盾している場合、手動更新せずエスカレーションしてください。

## 探すべきログ文字列

Vercel:

- `Subscription creation error:`
- `[Stripe webhook] signature missing`
- `[Stripe webhook] signature verification failed`
- `Stripe webhook event:`
- `Unhandled event type:`
- `Webhook processing failed:`
- `Webhook error:`
- `[Stripe webhook] billing activated via checkout.session.completed`
- `[Stripe webhook] invoice.paid for unknown subscription`
- `[Stripe webhook] subscription period renewed`
- `[Stripe webhook] invoice.payment_failed without subscription id`
- `[Stripe webhook] subscription marked past_due`
- `[Stripe webhook] subscription cancelled`
- `[Stripe webhook] subscription cancelled due to refund`
- `[BillingActivation] failed to fetch session for customer recovery`
- `[BillingActivation] failed to fetch session for subscription recovery`
- `[BillingActivation] completed`
- `[SubscriptionReconcile] Stripe session fetch failed:`
- `[SubscriptionReconcile] Could not fetch subscription for period dates`
- `[SubscriptionReconcile] failed:`
- `Subscription me API error:`

Stripe Dashboard:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`
- Webhook attemptのHTTP status 401 / 500

## 確認する環境変数

Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `NEXT_PUBLIC_APP_URL`

確認観点:

- `STRIPE_WEBHOOK_SECRET` がStripe Dashboardの対象Webhook endpointと一致していること。
- `STRIPE_SECRET_KEY` と `STRIPE_PRICE_ID` が同じStripe環境の値であること。
- `NEXT_PUBLIC_APP_URL` が本番ドメインを指し、Checkout success / cancel URLが期待通りになること。
- PreviewとProductionでStripe test/live keyを混在させていないこと。

## 確認するSupabaseテーブルまたはSQL例

Checkout Session単位の確認:

```sql
select
  id,
  user_id,
  plan_id,
  status,
  used_at,
  stripe_customer_id,
  stripe_subscription_id,
  failure_code,
  failure_message,
  last_event_type,
  processing_started_at,
  created_at,
  updated_at
from subscription_sessions
where id = '<CHECKOUT_SESSION_ID>';
```

ユーザーの購読状態:

```sql
select
  user_id,
  status,
  plan,
  pro_source,
  stripe_customer_id,
  stripe_subscription_id,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  cancel_requested_at,
  test_pro_expires_at,
  updated_at
from subscriptions
where user_id = '<USER_ID>';
```

直近の未完了セッション:

```sql
select
  id,
  user_id,
  plan_id,
  status,
  failure_code,
  failure_message,
  last_event_type,
  processing_started_at,
  created_at,
  updated_at
from subscription_sessions
where status in ('pending', 'failed')
order by created_at desc
limit 50;
```

Webhook処理状況:

```sql
select
  id,
  type,
  status,
  attempt_count,
  last_error,
  received_at,
  processed_at,
  updated_at
from webhook_events
order by received_at desc
limit 50;
```

Webhook失敗のみ:

```sql
select
  id,
  type,
  status,
  attempt_count,
  last_error,
  updated_at
from webhook_events
where status = 'failed'
order by updated_at desc
limit 20;
```

メールアドレスからユーザーを探す場合は、Supabase DashboardのAuthentication > Usersで対象メールを検索し、`user_id` を確認します。

## 触ってはいけないこと

- Stripe webhook署名検証を無効化しない。
- `subscriptions` を手動で `pro_source='billing'` にしない。`billing` は実Stripe契約ID `stripe_subscription_id` がある場合だけです。
- `subscription_sessions.status` を手動で `succeeded` にしない。
- `webhook_events` を削除して再処理を誘発しない。
- `claim_subscription_session` や `claim_webhook_event` のidempotencyを迂回しない。
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、Customer ID、支払い詳細をユーザー説明に含めない。
- 本番Stripe APIを叩くE2Eや本番操作を、初動確認として実行しない。
- KOMOJU資料を現行Web課金の正として扱わない。

## ユーザーへ説明する時の文面例

支払い済みで反映待ちの場合:

> お支払い情報は確認中です。決済完了後の反映処理に遅延が発生している可能性があるため、Stripe側の支払い状態とアプリ側の反映状態を照合しています。確認が取れ次第、Pro状態の反映状況をご案内します。

Stripeでは未完了の場合:

> 現時点では決済完了を確認できていません。カード認証や決済画面の完了前に中断された可能性があります。お手数ですが、再度Pro登録画面からお試しください。

失敗イベントが確認できた場合:

> 決済処理が失敗として記録されていました。カード会社の承認、入力情報、利用可能残高などをご確認のうえ、再度お手続きをお願いします。

## エスカレーション条件

- Stripe Dashboardでは `paid` なのに、`subscriptions.pro_source='billing'` にならない。
- `webhook_events.status='failed'` が複数発生している。
- Webhook endpointが継続して401または500を返している。
- `subscription_sessions.status='pending'` で `processing_started_at` が5分以上残る。
- `stripe_customer_id` または `stripe_subscription_id` がStripeとDBで不一致。
- 返金、解約、過去のテスト付与、Apple IAPが絡み、`pro_source` の判断が必要。
- 手動DB更新、Stripe Dashboardでの再送、環境変数変更が必要。

## 復旧後にdocsへ追記すべきこと

- 発生日時、対象Checkout Session IDの形式、影響ユーザー数。
- Stripe Dashboardで確認したイベント種別とattempt結果。
- Vercel Logsの代表的なエラー文字列。
- `subscription_sessions`, `subscriptions`, `webhook_events` の確認結果。
- 原因がwebhook secret、Stripe key混在、reconcile失敗、DB制約、Stripe側未完了のどれだったか。
- 実施した復旧操作と、再発防止策。
- このRunbookで不足していた確認手順。
