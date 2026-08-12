import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoinSystemEnabled } from './feature';
import { MANUAL_DERIVED_WORDS_COIN_COST } from './rates';
import type { CoinInfo } from './scan-gate';

/**
 * 手動追加の派生語コイン消費ゲート。
 *
 * manual-morphology-gate.ts と同じ「成果課金」: 呼び出し側は表示可能な派生語が
 * 得られた後にこのゲートを通し、`charged` が true のときだけ付与する。
 * 足切り（eligibility.ts）で落ちた単語はそもそもAIを呼ばないので、
 * ここまで来ない＝課金されない。
 *
 * - COIN_SYSTEM_ENABLED オフ  → 課金せず charged:true（無料で付与）
 * - オン & Pro & コイン充足    → コインを消費して charged:true
 * - オン & 無料 / コイン不足    → charged:false（派生語はスキップ、単語追加は継続）
 * - RPC 失敗                    → charged:false（best-effort、手動追加はブロックしない）
 */

interface ConsumeManualDerivedWordsRpcResponse {
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

export interface DerivedWordsChargeResult {
  /** 派生語を付与してよいか（コイン消費済み or フラグオフで課金不要） */
  charged: boolean;
  /** コインシステムが有効で実際に消費を試みたか */
  coinSystemEnabled: boolean;
  /** 消費後のコイン残高（消費できたときのみ） */
  coinInfo: CoinInfo | null;
}

export async function chargeManualDerivedWordsCoins(
  supabase: SupabaseClient,
  wordCount = 1,
): Promise<DerivedWordsChargeResult> {
  const count = Math.max(1, Math.floor(wordCount || 1));

  if (!isCoinSystemEnabled()) {
    return { charged: true, coinSystemEnabled: false, coinInfo: null };
  }

  const { data, error } = await supabase.rpc('consume_manual_derived_words_coins', {
    p_count: count,
  });

  if (error || !data) {
    console.error('[coins] consume_manual_derived_words_coins failed:', error);
    return { charged: false, coinSystemEnabled: true, coinInfo: null };
  }

  const result = data as ConsumeManualDerivedWordsRpcResponse;
  if (!result.allowed) {
    return { charged: false, coinSystemEnabled: true, coinInfo: null };
  }

  return {
    charged: true,
    coinSystemEnabled: true,
    coinInfo: {
      cost: result.cost ?? MANUAL_DERIVED_WORDS_COIN_COST * count,
      monthlyRemaining: result.monthly_remaining ?? 0,
      purchasedRemaining: result.purchased_remaining ?? 0,
      totalRemaining: result.total_remaining ?? 0,
      monthlyAllowance: result.monthly_allowance ?? 0,
    },
  };
}
