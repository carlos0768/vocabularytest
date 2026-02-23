import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

interface ScanUsageRpcResponse {
  allowed: boolean;
  current_count: number;
  limit: number | null;
  is_pro: boolean;
  requires_pro?: boolean;
}

interface ScanUsageResult {
  data: ScanUsageRpcResponse | null;
  error: PostgrestError | Error | null;
}

function isMissingBatchRpc(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code !== 'PGRST202') return false;
  return (error.message || '').includes('check_and_increment_scan_batch');
}

/**
 * Scan usage check wrapper.
 * Falls back to single-scan RPC when batch RPC is not deployed in the target DB yet.
 */
export async function checkAndIncrementScanUsage(
  supabase: SupabaseClient,
  options: { count: number; requirePro: boolean },
): Promise<ScanUsageResult> {
  const count = Math.max(1, Math.floor(options.count || 1));

  const batchResult = await supabase.rpc('check_and_increment_scan_batch', {
    p_count: count,
    p_require_pro: options.requirePro,
  });

  if (!batchResult.error) {
    return {
      data: batchResult.data as ScanUsageRpcResponse | null,
      error: null,
    };
  }

  if (!isMissingBatchRpc(batchResult.error)) {
    return { data: null, error: batchResult.error };
  }

  console.warn('[scan-usage] check_and_increment_scan_batch not found. Falling back to single RPC.');

  let latest: ScanUsageRpcResponse | null = null;
  for (let i = 0; i < count; i += 1) {
    const singleResult = await supabase.rpc('check_and_increment_scan', {
      p_require_pro: options.requirePro,
    });

    if (singleResult.error) {
      return { data: null, error: singleResult.error };
    }

    const current = singleResult.data as ScanUsageRpcResponse | null;
    if (!current) {
      return { data: null, error: new Error('scan usage response is empty') };
    }

    latest = current;
    if (current.requires_pro || !current.allowed) {
      return { data: current, error: null };
    }
  }

  return { data: latest, error: null };
}
