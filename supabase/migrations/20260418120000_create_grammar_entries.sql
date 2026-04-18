-- Phase 1 of note redesign: per-project grammar list.
-- Grammar entries are structured rows (pattern / meaning / category) with an
-- expandable HTML body. The corresponding UI block is a marker — entries are
-- keyed by project_id here so they can later be referenced across notes.

CREATE TABLE IF NOT EXISTS public.grammar_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  meaning TEXT NOT NULL,
  category TEXT,
  body JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grammar_entries_project_id
  ON public.grammar_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_grammar_entries_project_position
  ON public.grammar_entries(project_id, position);

ALTER TABLE public.grammar_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grammar entries"
  ON public.grammar_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = grammar_entries.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own grammar entries"
  ON public.grammar_entries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = grammar_entries.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own grammar entries"
  ON public.grammar_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = grammar_entries.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own grammar entries"
  ON public.grammar_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE projects.id = grammar_entries.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_grammar_entries_updated_at
  BEFORE UPDATE ON public.grammar_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
