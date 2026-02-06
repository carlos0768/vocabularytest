-- Upgrade user to Pro
-- Email pattern: %hack721%
-- Date: 2026-02-06
-- Description: Manually upgrade user with hack721 in email to Pro subscription

-- Insert or update subscription for the specified user
INSERT INTO subscriptions (user_id, plan, status, created_at, updated_at)
SELECT 
  id as user_id,
  'pro' as plan,
  'active' as status,
  NOW() as created_at,
  NOW() as updated_at
FROM auth.users
WHERE email ILIKE '%hack721%'
ON CONFLICT (user_id) 
DO UPDATE SET 
  plan = 'pro',
  status = 'active',
  updated_at = NOW();
