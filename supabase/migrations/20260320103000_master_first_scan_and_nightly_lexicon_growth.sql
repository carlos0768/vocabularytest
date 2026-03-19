-- Master-first scan lookup helper and nightly lexicon growth cron
--
-- Required Vault secrets for the cron job:
--   SELECT vault.create_secret('https://your-app.example.com', 'app_base_url');
--   SELECT vault.create_secret('your-service-role-key', 'supabase_service_role_key');

CREATE OR REPLACE FUNCTION public.get_lexicon_entries_by_keys(p_keys jsonb)
RETURNS TABLE (
  id uuid,
  headword text,
  normalized_headword text,
  pos text,
  cefr_level text,
  dataset_sources text[],
  translation_ja text,
  translation_source text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input_keys AS (
    SELECT DISTINCT
      nullif(trim(item->>'normalized_headword'), '') AS normalized_headword,
      nullif(trim(item->>'pos'), '') AS pos
    FROM jsonb_array_elements(COALESCE(p_keys, '[]'::jsonb)) AS item
  )
  SELECT
    le.id,
    le.headword,
    le.normalized_headword,
    le.pos,
    le.cefr_level,
    le.dataset_sources,
    le.translation_ja,
    le.translation_source,
    le.created_at,
    le.updated_at
  FROM public.lexicon_entries AS le
  INNER JOIN input_keys AS ik
    ON ik.normalized_headword = le.normalized_headword
   AND ik.pos = le.pos
  WHERE ik.normalized_headword IS NOT NULL
    AND ik.pos IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lexicon_entries_by_keys(jsonb) TO service_role;

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
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1) AS service_role_key
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
