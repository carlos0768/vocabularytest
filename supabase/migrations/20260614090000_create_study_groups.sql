CREATE TABLE IF NOT EXISTS public.study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT study_groups_name_length CHECK (char_length(trim(name)) BETWEEN 1 AND 40),
  CONSTRAINT study_groups_invite_code_format CHECK (invite_code ~ '^[A-Za-z0-9_]{4,64}$')
);

CREATE INDEX IF NOT EXISTS study_groups_owner_user_id_idx
  ON public.study_groups (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.study_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT study_group_members_group_user_key UNIQUE (group_id, user_id),
  CONSTRAINT study_group_members_role_check CHECK (role IN ('owner', 'member'))
);

CREATE INDEX IF NOT EXISTS study_group_members_user_id_idx
  ON public.study_group_members (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS study_group_members_group_id_idx
  ON public.study_group_members (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.study_group_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT study_group_projects_group_project_key UNIQUE (group_id, project_id)
);

CREATE INDEX IF NOT EXISTS study_group_projects_group_id_idx
  ON public.study_group_projects (group_id, created_at DESC);

CREATE INDEX IF NOT EXISTS study_group_projects_project_id_idx
  ON public.study_group_projects (project_id, created_at DESC);

ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_group_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "study_groups_select_member_groups" ON public.study_groups;
CREATE POLICY "study_groups_select_member_groups"
  ON public.study_groups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.study_group_members sgm
      WHERE sgm.group_id = study_groups.id
        AND sgm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "study_groups_insert_own" ON public.study_groups;
CREATE POLICY "study_groups_insert_own"
  ON public.study_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "study_groups_update_owner" ON public.study_groups;
CREATE POLICY "study_groups_update_owner"
  ON public.study_groups
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "study_groups_delete_owner" ON public.study_groups;
CREATE POLICY "study_groups_delete_owner"
  ON public.study_groups
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "study_group_members_select_own" ON public.study_group_members;
CREATE POLICY "study_group_members_select_own"
  ON public.study_group_members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_group_members_delete_own" ON public.study_group_members;
CREATE POLICY "study_group_members_delete_own"
  ON public.study_group_members
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "study_group_projects_select_group_members" ON public.study_group_projects;
CREATE POLICY "study_group_projects_select_group_members"
  ON public.study_group_projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.study_group_members sgm
      WHERE sgm.group_id = study_group_projects.group_id
        AND sgm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "study_group_projects_insert_group_members" ON public.study_group_projects;
CREATE POLICY "study_group_projects_insert_group_members"
  ON public.study_group_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.study_group_members sgm
      WHERE sgm.group_id = study_group_projects.group_id
        AND sgm.user_id = auth.uid()
    )
    AND public.is_caller_active_pro()
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = study_group_projects.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "study_group_projects_delete_authorized" ON public.study_group_projects;
CREATE POLICY "study_group_projects_delete_authorized"
  ON public.study_group_projects
  FOR DELETE
  TO authenticated
  USING (
    added_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.study_groups sg
      WHERE sg.id = study_group_projects.group_id
        AND sg.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = study_group_projects.project_id
        AND p.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS update_study_groups_updated_at
  ON public.study_groups;
CREATE TRIGGER update_study_groups_updated_at
  BEFORE UPDATE ON public.study_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
