import type { SupabaseClient } from '@supabase/supabase-js';
import { requiresProForModes, type ExtractMode } from '@/lib/scan/mode-provider';
import { checkAndIncrementScanUsage } from '@/lib/supabase/scan-usage';
import { isCoinSystemEnabled } from './feature';
import { MONTHLY_COIN_ALLOWANCE } from './rates';

export interface CoinInfo {
  cost: number;
  monthlyRemaining: number;
  purchasedRemaining: number;
  totalRemaining: number;
  monthlyAllowance: number;
}

export interface ScanGateInfo {
  currentCount: number;
  limit: number | null;
  isPro: boolean;
}

export type ScanGateOutcome =
  | { ok: true; scanInfo: ScanGateInfo; coinInfo: CoinInfo | null }
  | { ok: false; status: 403 | 429 | 500; body: Record<string, unknown> };

interface ConsumeScanCoinsRpcResponse {
  allowed: boolean;
  requires_pro: boolean;
  is_pro: boolean;
  reason?: string;
  cost: number | null;
  monthly_remaining?: number;
  purchased_remaining?: number;
  total_remaining?: number;
  monthly_allowance?: number;
  month_key?: string;
  current_count?: number;
}

const PRO_REQUIRED_ERROR = 'この機能はProプラン限定です。';
const GATE_FAILED_ERROR = 'スキャン制限の確認に失敗しました';
const INSUFFICIENT_COINS_ERROR =
  'コインが不足しています。コインを購入するか、翌月の付与をお待ちください。';

function toCoinInfo(data: ConsumeScanCoinsRpcResponse): CoinInfo {
  return {
    cost: data.cost ?? 0,
    monthlyRemaining: data.monthly_remaining ?? 0,
    purchasedRemaining: data.purchased_remaining ?? 0,
    totalRemaining: data.total_remaining ?? 0,
    monthlyAllowance: data.monthly_allowance ?? MONTHLY_COIN_ALLOWANCE,
  };
}

/**
 * スキャン消費ゲート。3つのスキャンルート（/api/extract, /api/scan-jobs/create,
 * /api/scan-jobs）が共通で呼ぶ。
 *
 * COIN_SYSTEM_ENABLED がオフのときは従来の check_and_increment_scan_batch に
 * 委譲し、現行挙動（Pro無制限）をそのまま維持する。オンのときは
 * consume_scan_coins RPC でコインを原子的に消費する。
 */
export async function consumeScanGate(
  supabase: SupabaseClient,
  options: {
    modes: ExtractMode[];
    imageCount: number;
    scanJobId?: string | null;
    includeMorphology?: boolean;
  },
): Promise<ScanGateOutcome> {
  const imageCount = Math.max(1, Math.floor(options.imageCount || 1));

  if (!isCoinSystemEnabled()) {
    return legacyGate(supabase, options.modes, imageCount);
  }

  const { data, error } = await supabase.rpc('consume_scan_coins', {
    p_modes: options.modes,
    p_image_count: imageCount,
    p_scan_job_id: options.scanJobId ?? null,
    // 語源解析オフ時は従来と同一のRPC呼び出しを維持する
    // （p_include_morphology 未対応のDBでも壊れないように）。
    ...(options.includeMorphology ? { p_include_morphology: true } : {}),
  });

  if (error || !data) {
    console.error('[coins] consume_scan_coins failed:', error);
    return { ok: false, status: 500, body: { error: GATE_FAILED_ERROR } };
  }

  const result = data as ConsumeScanCoinsRpcResponse;

  if (result.requires_pro) {
    return { ok: false, status: 403, body: { error: PRO_REQUIRED_ERROR } };
  }

  if (!result.allowed) {
    const coinInfo = toCoinInfo(result);
    return {
      ok: false,
      status: 429,
      body: {
        error: INSUFFICIENT_COINS_ERROR,
        // 旧iOSクライアント互換: limitReached で既存のブロックUIが出る
        limitReached: true,
        insufficientCoins: true,
        scanInfo: {
          currentCount: result.current_count ?? 0,
          limit: null,
          isPro: true,
        },
        coinInfo,
      },
    };
  }

  return {
    ok: true,
    scanInfo: {
      currentCount: result.current_count ?? 0,
      // limit:null は旧クライアントが「Pro無制限」として扱う表現
      limit: null,
      isPro: true,
    },
    coinInfo: toCoinInfo(result),
  };
}

async function legacyGate(
  supabase: SupabaseClient,
  modes: ExtractMode[],
  imageCount: number,
): Promise<ScanGateOutcome> {
  const requirePro = requiresProForModes(modes);
  const { data, error } = await checkAndIncrementScanUsage(supabase, {
    count: imageCount,
    requirePro,
  });

  if (error || !data) {
    console.error('Scan limit check error:', error);
    return { ok: false, status: 500, body: { error: GATE_FAILED_ERROR } };
  }

  if (data.requires_pro) {
    return { ok: false, status: 403, body: { error: PRO_REQUIRED_ERROR } };
  }

  if (!data.allowed) {
    return {
      ok: false,
      status: 429,
      body: {
        error: `本日のスキャン上限（${data.limit ?? '∞'}回）に達しました。`,
        limitReached: true,
        scanInfo: {
          currentCount: data.current_count,
          limit: data.limit,
          isPro: data.is_pro,
        },
      },
    };
  }

  return {
    ok: true,
    scanInfo: {
      currentCount: data.current_count,
      limit: data.limit,
      isPro: data.is_pro,
    },
    coinInfo: null,
  };
}
