-- Explicit RLS policies for internal-only tables
-- Goal: remove "RLS enabled, no policy" findings while keeping tables inaccessible
-- to anon/authenticated clients.

-- ============================================
-- otp_requests
-- ============================================
DROP POLICY IF EXISTS "Service role full access to otp_requests" ON public.otp_requests;
DROP POLICY IF EXISTS "No direct access to otp_requests" ON public.otp_requests;

CREATE POLICY "Service role full access to otp_requests"
  ON public.otp_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "No direct access to otp_requests"
  ON public.otp_requests
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================
-- webhook_events
-- ============================================
DROP POLICY IF EXISTS "Service role full access to webhook_events" ON public.webhook_events;
DROP POLICY IF EXISTS "No direct access to webhook_events" ON public.webhook_events;

CREATE POLICY "Service role full access to webhook_events"
  ON public.webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "No direct access to webhook_events"
  ON public.webhook_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
