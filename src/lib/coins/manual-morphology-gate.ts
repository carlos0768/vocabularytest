import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoinSystemEnabled } from './feature';
import { MANUAL_MORPHOLOGY_COIN_COST } from './rates';
import type { CoinInfo } from './scan-gate';

/**
 * 手動追加の語源解析コイン消費ゲート。
 *
 * スキャンと違い「成果課金」: 呼び出し側は表示可能な語源解析が得られた後に
 * このゲートを通し、`charged` が true のときだけ morphology を付与する。
 *
 * - COIN_SYSTEM_ENABLED オフ  → 課金せず charged:true（従来どおり無料で付与）
 * - オン & Pro & コイン充足    → コインを消費して charged:true
 * - オン & 無料 / コイン不足    → charged:false（語源解析はスキップ、単語追加は継続）
 * - RPC 失敗                    → charged:false（best-effort、手動追加はブロックしない）
 */

interface ConsumeManualMorphologyRpcResponse {
  allowed: boolean;
  requires_pro?: boolean;
  is_pro?: boolean;
  reason?: string;
  cost?: number | null;
  monthly_remaining?: number;
  purchased_remaining?: number;
  total_remaining?: number;
  monthly_allowance?: number;
}

export interface ManualMorphologyChargeResult {
  /** morphology を付与してよいか（コイン消費済み or フラグオフで課金不要） */
  charged: boolean;
  /** コインシステムが有効で実際に消費を試みたか */
  coinSystemEnabled: boolean;
  /** 消費後のコイン残高（消費できたときのみ） */
  coinInfo: CoinInfo | null;
}

export async function chargeManualMorphologyCoins(
  supabase: SupabaseClient,
  wordCount = 1,
): Promise<ManualMorphologyChargeResult> {
  const count = Math.max(1, Math.floor(wordCount || 1));

  if (!isCoinSystemEnabled()) {
    return { charged: true, coinSystemEnabled: false, coinInfo: null };
  }

  const { data, error } = await supabase.rpc('consume_manual_morphology_coins', {
    p_count: count,
  });

  if (error || !data) {
    console.error('[coins] consume_manual_morphology_coins failed:', error);
    return { charged: false, coinSystemEnabled: true, coinInfo: null };
  }

  const result = data as ConsumeManualMorphologyRpcResponse;
  if (!result.allowed) {
    return { charged: false, coinSystemEnabled: true, coinInfo: null };
  }

  return {
    charged: true,
    coinSystemEnabled: true,
    coinInfo: {
      cost: result.cost ?? MANUAL_MORPHOLOGY_COIN_COST * count,
      monthlyRemaining: result.monthly_remaining ?? 0,
      purchasedRemaining: result.purchased_remaining ?? 0,
      totalRemaining: result.total_remaining ?? 0,
      monthlyAllowance: result.monthly_allowance ?? 0,
    },
  };
}
