-- iOS APNs device token records per user/device
CREATE TABLE IF NOT EXISTS ios_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  bundle_id TEXT NOT NULL DEFAULT 'com.merken.iosnative',
  app_version TEXT,
  os_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One token per device
CREATE UNIQUE INDEX IF NOT EXISTS idx_ios_device_tokens_token
  ON ios_device_tokens(device_token);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_ios_device_tokens_user_id
  ON ios_device_tokens(user_id);

ALTER TABLE ios_device_tokens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ios_device_tokens'
      AND policyname = 'Users can view own iOS device tokens'
  ) THEN
    CREATE POLICY "Users can view own iOS device tokens"
      ON ios_device_tokens FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ios_device_tokens'
      AND policyname = 'Users can create own iOS device tokens'
  ) THEN
    CREATE POLICY "Users can create own iOS device tokens"
      ON ios_device_tokens FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ios_device_tokens'
      AND policyname = 'Users can update own iOS device tokens'
  ) THEN
    CREATE POLICY "Users can update own iOS device tokens"
      ON ios_device_tokens FOR UPDATE
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
      AND tablename = 'ios_device_tokens'
      AND policyname = 'Users can delete own iOS device tokens'
  ) THEN
    CREATE POLICY "Users can delete own iOS device tokens"
      ON ios_device_tokens FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
