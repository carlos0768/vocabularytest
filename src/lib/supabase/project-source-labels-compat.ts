import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

type ProjectPayload = Record<string, unknown>;

export interface ProjectSourceLabelsCompatResult<T> {
  data: T | null;
  error: PostgrestError | null;
  usedLegacyColumns: boolean;
}

function isMissingSourceLabelsColumn(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code !== '42703' && error.code !== 'PGRST204') return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return (
    message.includes('projects.source_labels') ||
    message.includes("'source_labels' column of 'projects'") ||
    message.includes('column projects.source_labels does not exist') ||
    message.includes('source_labels')
  );
}

export async function selectProjectWithSourceLabelsCompat<T extends { id: string; title?: string | null }>(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<ProjectSourceLabelsCompatResult<T>> {
  const firstAttempt = await supabase
    .from('projects')
    .select('id,title,source_labels')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  if (!firstAttempt.error) {
    return {
      data: firstAttempt.data as T,
      error: null,
      usedLegacyColumns: false,
    };
  }

  if (!isMissingSourceLabelsColumn(firstAttempt.error)) {
    return {
      data: null,
      error: firstAttempt.error,
      usedLegacyColumns: false,
    };
  }

  const legacyAttempt = await supabase
    .from('projects')
    .select('id,title')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  return {
    data: legacyAttempt.data as T | null,
    error: legacyAttempt.error,
    usedLegacyColumns: true,
  };
}

export async function insertProjectWithSourceLabelsCompat<T extends { id: string; title?: string | null }>(
  supabase: SupabaseClient,
  payload: ProjectPayload,
): Promise<ProjectSourceLabelsCompatResult<T>> {
  const firstAttempt = await supabase
    .from('projects')
    .insert(payload)
    .select()
    .single();

  if (!firstAttempt.error) {
    return {
      data: firstAttempt.data as T,
      error: null,
      usedLegacyColumns: false,
    };
  }

  if (!isMissingSourceLabelsColumn(firstAttempt.error)) {
    return {
      data: null,
      error: firstAttempt.error,
      usedLegacyColumns: false,
    };
  }

  const legacyPayload = { ...payload };
  delete legacyPayload.source_labels;

  const legacyAttempt = await supabase
    .from('projects')
    .insert(legacyPayload)
    .select()
    .single();

  return {
    data: legacyAttempt.data as T | null,
    error: legacyAttempt.error,
    usedLegacyColumns: true,
  };
}

export async function updateProjectSourceLabelsCompat(
  supabase: SupabaseClient,
  projectId: string,
  sourceLabels: string[],
  userId?: string,
): Promise<{ error: PostgrestError | null; usedLegacyColumns: boolean }> {
  let firstAttemptQuery = supabase
    .from('projects')
    .update({ source_labels: sourceLabels })
    .eq('id', projectId);

  if (userId !== undefined) {
    firstAttemptQuery = firstAttemptQuery.eq('user_id', userId);
  }

  const firstAttempt = await firstAttemptQuery;

  if (!firstAttempt.error) {
    return { error: null, usedLegacyColumns: false };
  }

  if (!isMissingSourceLabelsColumn(firstAttempt.error)) {
    return { error: firstAttempt.error, usedLegacyColumns: false };
  }

  return { error: null, usedLegacyColumns: true };
}

export function hasMissingProjectSourceLabelsColumn(error: PostgrestError | null): boolean {
  return isMissingSourceLabelsColumn(error);
}
