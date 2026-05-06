-- Track the latest MERKEN home open time per signed-in user.

CREATE TABLE IF NOT EXISTS public.user_last_opened (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_last_opened_last_opened_at
  ON public.user_last_opened (last_opened_at DESC);

ALTER TABLE public.user_last_opened ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own last opened"
  ON public.user_last_opened;
CREATE POLICY "Users can view own last opened"
  ON public.user_last_opened
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own last opened"
  ON public.user_last_opened;
CREATE POLICY "Users can insert own last opened"
  ON public.user_last_opened
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own last opened"
  ON public.user_last_opened;
CREATE POLICY "Users can update own last opened"
  ON public.user_last_opened
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to user last opened"
  ON public.user_last_opened;
CREATE POLICY "Service role full access to user last opened"
  ON public.user_last_opened
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
