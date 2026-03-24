-- Nightly backfill for lexicon example sentences
-- 04:00 JST = 19:00 UTC (previous day)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'nightly-lexicon-example-backfill'
  ) THEN
    PERFORM cron.unschedule('nightly-lexicon-example-backfill');
  END IF;
END $$;

SELECT cron.schedule(
  'nightly-lexicon-example-backfill',
  '0 19 * * *',
  $$
  -- Backfill lexicon_entries examples from words table
  -- For lexicon entries that have no example but linked words do
  UPDATE public.lexicon_entries le
  SET
    example_sentence = w.example_sentence,
    example_sentence_ja = w.example_sentence_ja,
    updated_at = now()
  FROM public.words w
  WHERE w.lexicon_entry_id = le.id
    AND le.example_sentence IS NULL
    AND w.example_sentence IS NOT NULL
    AND w.example_sentence != '';
  $$
);
