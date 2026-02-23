import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

type ScanJobInsertPayload = Record<string, unknown>;

interface InsertScanJobCompatResult {
  data: Record<string, unknown> | null;
  error: PostgrestError | null;
  usedLegacyColumns: boolean;
}

function isMissingCompatColumn(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code !== '42703' && error.code !== 'PGRST204') return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return (
    message.includes('scan_jobs.save_mode') ||
    message.includes('scan_jobs.target_project_id') ||
    message.includes("'save_mode' column of 'scan_jobs'") ||
    message.includes("'target_project_id' column of 'scan_jobs'")
  );
}

/**
 * Inserts scan_jobs rows with backward compatibility for DBs
 * where save_mode/target_project_id columns are not deployed yet.
 */
export async function insertScanJobWithCompat(
  supabase: SupabaseClient,
  payload: ScanJobInsertPayload,
): Promise<InsertScanJobCompatResult> {
  const firstAttempt = await supabase
    .from('scan_jobs')
    .insert(payload)
    .select()
    .single();

  if (!firstAttempt.error) {
    return {
      data: firstAttempt.data as Record<string, unknown>,
      error: null,
      usedLegacyColumns: false,
    };
  }

  if (!isMissingCompatColumn(firstAttempt.error)) {
    return {
      data: null,
      error: firstAttempt.error,
      usedLegacyColumns: false,
    };
  }

  const legacyPayload = { ...payload };
  delete legacyPayload.save_mode;
  delete legacyPayload.target_project_id;

  const legacyAttempt = await supabase
    .from('scan_jobs')
    .insert(legacyPayload)
    .select()
    .single();

  return {
    data: legacyAttempt.data as Record<string, unknown> | null,
    error: legacyAttempt.error,
    usedLegacyColumns: true,
  };
}
