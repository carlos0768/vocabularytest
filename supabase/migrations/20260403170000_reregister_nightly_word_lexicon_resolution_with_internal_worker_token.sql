-- Prefer dedicated internal worker token for nightly master lexicon growth cron.
-- Required Vault secrets:
--   SELECT vault.create_secret('https://your-app.example.com', 'app_base_url');
--   SELECT vault.create_secret('your-internal-worker-token', 'internal_worker_token');
-- Fallback Vault secret (backward compatibility):
--   SELECT vault.create_secret('your-service-role-key', 'supabase_service_role_key');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'nightly-word-lexicon-resolution'
  ) THEN
    PERFORM cron.unschedule('nightly-word-lexicon-resolution');
  END IF;
END $$;

SELECT cron.schedule(
  'nightly-word-lexicon-resolution',
  '30 18 * * *',
  $$
  WITH secrets AS (
    SELECT
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url' LIMIT 1) AS app_base_url,
      COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_worker_token' LIMIT 1),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1)
      ) AS worker_token
  )
  SELECT CASE
    WHEN app_base_url IS NULL OR worker_token IS NULL THEN NULL
    ELSE net.http_post(
      url := trim(trailing '/' FROM app_base_url) || '/api/word-lexicon-resolution/process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || worker_token
      ),
      body := '{}'::jsonb
    )
  END
  FROM secrets;
  $$
);
