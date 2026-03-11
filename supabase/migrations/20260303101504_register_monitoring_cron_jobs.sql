-- Register monitoring cron jobs
-- These use pg_net to call Edge Functions with the MONITORING_SECRET header.
-- Prerequisites:
--   1. Store monitoring secret in Vault:
--      SELECT vault.create_secret('your-secret-value', 'monitoring_secret');
--   2. Store Supabase anon key in Vault:
--      SELECT vault.create_secret('your-anon-key', 'supabase_anon_key');
--   3. Set the project URL below

-- Daily cost report: every day at 0:00 UTC (9:00 JST)
SELECT cron.schedule(
  'daily-cost-report',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ryoyvpayoacgeqgoehgk.supabase.co/functions/v1/daily-cost-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-monitoring-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monitoring_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cost threshold alert: every hour at :05
SELECT cron.schedule(
  'cost-threshold-alert',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ryoyvpayoacgeqgoehgk.supabase.co/functions/v1/cost-threshold-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-monitoring-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monitoring_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily KOMOJU report: every day at 0:05 UTC (9:05 JST)
SELECT cron.schedule(
  'daily-komoju-report',
  '5 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ryoyvpayoacgeqgoehgk.supabase.co/functions/v1/daily-komoju-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-monitoring-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monitoring_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);;
