-- Allow protected Vercel Preview deployments to receive the study reminder cron request.
-- Optional Vault secret:
--   vercel_automation_bypass_secret -> sent as x-vercel-protection-bypass

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'study-reminder-push-dispatch'
  ) THEN
    PERFORM cron.unschedule('study-reminder-push-dispatch');
  END IF;
END $$;

SELECT cron.schedule(
  'study-reminder-push-dispatch',
  '* * * * *',
  $$
  WITH secrets AS (
    SELECT
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url' LIMIT 1) AS app_base_url,
      COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_worker_token' LIMIT 1),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
      ) AS worker_token,
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vercel_automation_bypass_secret' LIMIT 1) AS vercel_bypass_secret
  )
  SELECT CASE
    WHEN app_base_url IS NULL OR worker_token IS NULL THEN NULL
    ELSE net.http_post(
      url := trim(trailing '/' FROM app_base_url) || '/api/notifications/study-reminders/dispatch',
      headers := jsonb_strip_nulls(jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || worker_token,
        'x-vercel-protection-bypass', vercel_bypass_secret
      )),
      body := '{}'::jsonb
    )
  END
  FROM secrets;
  $$
);
