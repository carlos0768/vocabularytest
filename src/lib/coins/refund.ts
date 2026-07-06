import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * スキャンジョブ失敗時のコイン返還（ベストエフォート）。
 *
 * 冪等性は refund_scan_coins RPC 側の部分ユニークインデックスで担保される
 * （consume が無ければ no_consume、返還済みなら already_refunded で無害終了）。
 * 返還の失敗が失敗処理パス自体を壊してはならないため、エラーは握って警告ログのみ。
 *
 * 意図的に COIN_SYSTEM_ENABLED を見ない: フラグを途中でオフにしても、
 * 消費済みの処理中スキャンが失敗したら返還されるべきため。RPC 未適用の
 * 環境ではエラーになるが catch で吸収される。
 */
export async function refundScanCoinsForJob(
  scanJobId: string,
  supabaseAdmin?: SupabaseClient,
): Promise<void> {
  try {
    const admin = supabaseAdmin ?? getSupabaseAdmin();
    const { data, error } = await admin.rpc('refund_scan_coins', {
      p_scan_job_id: scanJobId,
    });
    if (error) {
      console.warn('[coins] refund_scan_coins failed:', { scanJobId, message: error.message });
      return;
    }
    const result = data as { refunded?: boolean; reason?: string } | null;
    if (result?.refunded) {
      console.log('[coins] refunded scan coins:', { scanJobId });
    } else if (result?.reason && result.reason !== 'no_consume') {
      console.log('[coins] refund skipped:', { scanJobId, reason: result.reason });
    }
  } catch (error) {
    console.warn('[coins] refund_scan_coins unexpected error:', {
      scanJobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
