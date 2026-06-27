-- Enable study reminder notifications by default for new preference rows.
ALTER TABLE public.user_preferences
  ALTER COLUMN study_reminder_enabled SET DEFAULT true;
