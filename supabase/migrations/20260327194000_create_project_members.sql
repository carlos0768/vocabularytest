CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor',
  added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT project_members_project_user_key UNIQUE (project_id, user_id),
  CONSTRAINT project_members_role_check CHECK (role IN ('editor'))
);

CREATE INDEX IF NOT EXISTS project_members_user_id_idx
ON public.project_members (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_members_project_id_idx
ON public.project_members (project_id, created_at DESC);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members_select_own" ON public.project_members;
CREATE POLICY "project_members_select_own"
ON public.project_members
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_members_insert_self" ON public.project_members;
CREATE POLICY "project_members_insert_self"
ON public.project_members
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_members_delete_own" ON public.project_members;
CREATE POLICY "project_members_delete_own"
ON public.project_members
FOR DELETE
USING (auth.uid() = user_id);
