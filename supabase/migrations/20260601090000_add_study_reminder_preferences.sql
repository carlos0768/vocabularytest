-- User-configurable study reminder push notification settings.

CREATE OR REPLACE FUNCTION public.is_valid_study_reminder_times(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR jsonb_typeof(value) <> 'array' THEN false
    ELSE
      jsonb_array_length(value) BETWEEN 1 AND 6
      AND (
        SELECT
          count(*) = count(DISTINCT item->>'id')
          AND count(*) = count(DISTINCT item->>'time')
        FROM jsonb_array_elements(value) AS item
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(value) AS item
        WHERE jsonb_typeof(item) <> 'object'
          OR NOT (item ? 'id')
          OR NOT (item ? 'time')
          OR NOT (item ? 'enabled')
          OR jsonb_typeof(item->'id') <> 'string'
          OR jsonb_typeof(item->'time') <> 'string'
          OR jsonb_typeof(item->'enabled') <> 'boolean'
          OR (item->>'id') !~ '^[A-Za-z0-9_-]{1,40}$'
          OR (item->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      )
  END;
$$;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS study_reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS study_reminder_times jsonb NOT NULL DEFAULT
    '[{"id":"morning","time":"08:00","enabled":true},{"id":"evening","time":"16:30","enabled":true}]'::jsonb,
  ADD COLUMN IF NOT EXISTS study_reminder_timezone text NOT NULL DEFAULT 'Asia/Tokyo',
  ADD COLUMN IF NOT EXISTS study_reminder_last_sent_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_study_reminder_times_valid'
      AND conrelid = 'public.user_preferences'::regclass
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_study_reminder_times_valid
      CHECK (public.is_valid_study_reminder_times(study_reminder_times));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_study_reminder_timezone_length'
      AND conrelid = 'public.user_preferences'::regclass
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_study_reminder_timezone_length
      CHECK (char_length(study_reminder_timezone) BETWEEN 1 AND 100);
  END IF;
END $$;

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
      ) AS worker_token
  )
  SELECT CASE
    WHEN app_base_url IS NULL OR worker_token IS NULL THEN NULL
    ELSE net.http_post(
      url := trim(trailing '/' FROM app_base_url) || '/api/notifications/study-reminders/dispatch',
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
