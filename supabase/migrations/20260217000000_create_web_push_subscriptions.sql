-- Web Push subscription records per user/device
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_push_subscriptions_endpoint
  ON web_push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_id
  ON web_push_subscriptions(user_id);
ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can view own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can view own web push subscriptions"
      ON web_push_subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can create own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can create own web push subscriptions"
      ON web_push_subscriptions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can update own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can update own web push subscriptions"
      ON web_push_subscriptions FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can delete own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can delete own web push subscriptions"
      ON web_push_subscriptions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
