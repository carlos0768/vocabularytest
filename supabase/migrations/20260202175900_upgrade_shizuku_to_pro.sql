-- Upgrade user to Pro
-- Email: shizuku_may20090303@yahoo.co.jp
-- Date: 2026-02-02

INSERT INTO subscriptions (user_id, plan, status, created_at, updated_at)
SELECT 
  id as user_id,
  'pro' as plan,
  'active' as status,
  NOW() as created_at,
  NOW() as updated_at
FROM auth.users
WHERE email = 'shizuku_may20090303@yahoo.co.jp'
ON CONFLICT (user_id) 
DO UPDATE SET 
  plan = 'pro',
  status = 'active',
  updated_at = NOW();
