-- Mark the four existing pre-1 projects as official onboarding sources.
-- The source content stays in the normal projects / words / word_translations
-- tables, so official wordbooks have the same shape as every other wordbook.

WITH seed(project_id, official_title, official_slug, official_sort_order) AS (
  VALUES
    ('bb12e258-7731-4a06-ba31-b277bd256b03'::uuid, '英検準一級単語集1', 'eiken-pre1-default-1', 1),
    ('bed17fdf-168c-4f3f-8aff-0e612bb2d161'::uuid, '英検準一級単語集2', 'eiken-pre1-default-2', 2),
    ('59affa0b-65af-4051-a1ca-7a6f22a21ddc'::uuid, '英検準一級単語集3', 'eiken-pre1-default-3', 3),
    ('880ac7f4-0af5-4965-a45b-10bf6d3cedb7'::uuid, '英検準一級単語集4', 'eiken-pre1-default-4', 4)
)
UPDATE public.projects projects
SET
  official_slug = seed.official_slug,
  official_title = seed.official_title,
  official_description = '英検準一級向けの公式単語帳です。',
  official_eiken_level = 'pre1',
  official_is_default = true,
  official_is_active = true,
  official_sort_order = seed.official_sort_order,
  updated_at = now()
FROM seed
WHERE projects.id = seed.project_id;

DO $$
DECLARE
  marked_projects integer;
  empty_projects integer;
BEGIN
  SELECT count(*)
  INTO marked_projects
  FROM public.projects
  WHERE official_slug IN (
    'eiken-pre1-default-1',
    'eiken-pre1-default-2',
    'eiken-pre1-default-3',
    'eiken-pre1-default-4'
  )
    AND official_eiken_level = 'pre1'
    AND official_is_default
    AND official_is_active;

  IF marked_projects <> 4 THEN
    RAISE EXCEPTION 'pre1 official seed marked % project(s), expected 4', marked_projects;
  END IF;

  SELECT count(*)
  INTO empty_projects
  FROM public.projects projects
  WHERE projects.official_slug IN (
    'eiken-pre1-default-1',
    'eiken-pre1-default-2',
    'eiken-pre1-default-3',
    'eiken-pre1-default-4'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.words words
      WHERE words.project_id = projects.id
    );

  IF empty_projects > 0 THEN
    RAISE EXCEPTION 'pre1 official seed found % empty source project(s)', empty_projects;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
