-- Re-register nightly word lexicon resolution to run at 03:00 JST
-- and tolerate Vault secret naming drift for service role key.

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
  '0 18 * * *',
  $$
  WITH secrets AS (
    SELECT
      COALESCE(
        (SELECT trim(both FROM decrypted_secret) FROM vault.decrypted_secrets WHERE name = 'app_base_url' LIMIT 1),
        (SELECT trim(both FROM decrypted_secret) FROM vault.decrypted_secrets WHERE name = 'APP_BASE_URL' LIMIT 1)
      ) AS app_base_url,
      COALESCE(
        (SELECT trim(both FROM decrypted_secret) FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1),
        (SELECT trim(both FROM decrypted_secret) FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
      ) AS service_role_key
  )
  SELECT CASE
    WHEN app_base_url IS NULL OR service_role_key IS NULL THEN NULL
    ELSE net.http_post(
      url := trim(trailing '/' FROM app_base_url) || '/api/word-lexicon-resolution/process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := '{}'::jsonb
    )
  END
  FROM secrets;
  $$
);
