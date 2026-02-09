-- KOMOJU運用モニタリングSQL
-- Supabase SQL Editor / MCP execute_sql でそのまま実行可能

-- 1) 直近24時間のWebhook失敗イベント
SELECT
  COUNT(*) AS failed_count_24h
FROM public.webhook_events
WHERE status = 'failed'
  AND updated_at >= NOW() - INTERVAL '24 hours';

-- 2) スタックしているprocessingイベント（10分以上）
SELECT
  id,
  type,
  attempt_count,
  updated_at,
  last_error
FROM public.webhook_events
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '10 minutes'
ORDER BY updated_at ASC
LIMIT 100;

-- 3) 直近24時間の決済セッション失敗件数
SELECT
  COUNT(*) AS failed_sessions_24h
FROM public.subscription_sessions
WHERE status = 'failed'
  AND updated_at >= NOW() - INTERVAL '24 hours';

-- 4) pendingのまま15分以上経過した決済セッション
SELECT
  id,
  user_id,
  plan_id,
  created_at,
  updated_at,
  failure_code,
  failure_message,
  last_event_type
FROM public.subscription_sessions
WHERE status = 'pending'
  AND used_at IS NULL
  AND updated_at < NOW() - INTERVAL '15 minutes'
ORDER BY updated_at ASC
LIMIT 100;

-- 5) staleな未使用決済セッション（1時間以上）
SELECT
  id,
  user_id,
  plan_id,
  idempotency_key,
  created_at
FROM public.subscription_sessions
WHERE used_at IS NULL
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at ASC
LIMIT 100;

-- 6) subscription.captured処理済みなのにbilling化できていない候補（直近24時間）
SELECT
  we.id AS webhook_event_id,
  we.updated_at AS webhook_processed_at,
  split_part(we.id, ':', 3) AS komoju_subscription_id,
  s.user_id,
  s.status AS subscription_status,
  s.pro_source
FROM public.webhook_events AS we
LEFT JOIN public.subscriptions AS s
  ON s.komoju_subscription_id = split_part(we.id, ':', 3)
WHERE we.id LIKE 'subscription:subscription.captured:%'
  AND we.status = 'processed'
  AND we.updated_at >= NOW() - INTERVAL '24 hours'
  AND (
    s.user_id IS NULL
    OR s.status <> 'active'
    OR s.pro_source <> 'billing'
  )
ORDER BY we.updated_at DESC
LIMIT 200;

-- 7) Proソース内訳（運用確認）
SELECT
  pro_source,
  status,
  plan,
  COUNT(*) AS count
FROM public.subscriptions
GROUP BY pro_source, status, plan
ORDER BY pro_source, status, plan;

-- 8) 期限切れ/期限間近のtest Pro（7日以内）
SELECT
  user_id,
  test_pro_expires_at,
  status,
  plan
FROM public.subscriptions
WHERE pro_source = 'test'
  AND status = 'active'
  AND plan = 'pro'
  AND test_pro_expires_at IS NOT NULL
  AND test_pro_expires_at <= NOW() + INTERVAL '7 days'
ORDER BY test_pro_expires_at ASC;
