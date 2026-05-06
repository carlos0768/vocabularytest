-- Retire database artifacts that only supported removed dead AI APIs.
-- The active embedding rebuild/manual lexicon-resolution paths are intentionally left intact.

DROP TABLE IF EXISTS public.word_similar_cache;
DROP TABLE IF EXISTS public.lexicon_enrichment_jobs;
