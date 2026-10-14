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
    message.includes('scan_jobs.scan_modes') ||
    message.includes('scan_jobs.project_kind') ||
    message.includes('scan_jobs.include_morphology') ||
    message.includes('scan_jobs.include_examples') ||
    message.includes('scan_jobs.custom_prompt') ||
    message.includes('scan_jobs.custom_scan_mode_id') ||
    message.includes("'save_mode' column of 'scan_jobs'") ||
    message.includes("'target_project_id' column of 'scan_jobs'") ||
    message.includes("'scan_modes' column of 'scan_jobs'") ||
    message.includes("'project_kind' column of 'scan_jobs'") ||
    message.includes("'include_morphology' column of 'scan_jobs'") ||
    message.includes("'include_examples' column of 'scan_jobs'") ||
    message.includes("'custom_prompt' column of 'scan_jobs'") ||
    message.includes("'custom_scan_mode_id' column of 'scan_jobs'")
  );
}

function isMissingTargetSectionColumn(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code !== '42703' && error.code !== 'PGRST204') return false;
  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  return message.includes('target_section_name');
}

/**
 * Inserts scan_jobs rows with backward compatibility for DBs
 * where save_mode/target_project_id columns are not deployed yet.
 */
export async function insertScanJobWithCompat(
  supabase: SupabaseClient,
  payload: ScanJobInsertPayload,
): Promise<InsertScanJobCompatResult> {
  // 入り先セクションの列はいちばん新しい。未適用の DB では、ほかの列まで落とす
  // 下の互換経路に入れず、セクションだけ諦めて (未分類で保存) 作り直す。
  if (payload.target_section_name == null) {
    return insertScanJobWithLegacyCompat(supabase, withoutTargetSection(payload));
  }
  const result = await insertScanJobWithLegacyCompat(supabase, payload);
  if (!isMissingTargetSectionColumn(result.error)) return result;
  return insertScanJobWithLegacyCompat(supabase, withoutTargetSection(payload));
}

async function insertScanJobWithLegacyCompat(
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
  delete legacyPayload.scan_modes;
  delete legacyPayload.project_kind;
  delete legacyPayload.include_morphology;
  delete legacyPayload.include_examples;
  delete legacyPayload.custom_prompt;
  delete legacyPayload.custom_scan_mode_id;

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

function withoutTargetSection(payload: ScanJobInsertPayload): ScanJobInsertPayload {
  const rest = { ...payload };
  delete rest.target_section_name;
  return rest;
}
