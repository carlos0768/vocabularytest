import type { ExtractMode } from '@/lib/scan/mode-provider';

// コイン消費レートの単一情報源（TS側ミラー）。
// SQL側の実体は supabase/migrations/20260705120000_create_coin_system.sql の
// scan_coin_cost() / consume_scan_coins()。両者のリテラル一致は
// src/lib/coins/rates.test.ts のコントラクトテストで担保している。
// 変更時は必ず両方を同時に更新すること。
export const SCAN_MODE_COIN_RATES: Record<ExtractMode, number> = {
  circled: 2,
  all: 3,
  eiken: 3,
  idiom: 3,
};

export const EXTRA_IMAGE_COIN_COST = 1;

// 語源解析（接頭語・接尾語・接中語）オプションのサーチャージ。
// SQL側は 20260712101000_morphology_coin_cost.sql の scan_coin_cost()。
export const MORPHOLOGY_COIN_COST = 2;

// 手動追加時の語源解析コスト（1語あたり）。スキャンと違いモードがないため
// 定額。SQL側は 20260713120000_manual_morphology_coin_cost.sql の
// consume_manual_morphology_coins()。両者のリテラル一致は rates.test.ts で担保。
export const MANUAL_MORPHOLOGY_COIN_COST = 1;

export const MONTHLY_COIN_ALLOWANCE = 300;

export interface ScanCoinCostOptions {
  includeMorphology?: boolean;
}

// 複数モードは重複排除して合算、2枚目以降の画像は+1/枚。
// 語源解析オプションが有効なら +MORPHOLOGY_COIN_COST。
export function computeScanCoinCost(
  modes: ExtractMode[],
  imageCount: number,
  options: ScanCoinCostOptions = {},
): number {
  if (!Number.isFinite(imageCount) || imageCount < 1) {
    throw new Error('imageCount must be >= 1');
  }
  const uniqueModes = Array.from(new Set(modes));
  if (uniqueModes.length === 0) {
    throw new Error('modes must not be empty');
  }
  const modeCost = uniqueModes.reduce((sum, mode) => {
    const rate = SCAN_MODE_COIN_RATES[mode];
    if (rate === undefined) {
      throw new Error(`unknown scan mode: ${mode}`);
    }
    return sum + rate;
  }, 0);
  const morphologyCost = options.includeMorphology ? MORPHOLOGY_COIN_COST : 0;
  return modeCost + (Math.floor(imageCount) - 1) * EXTRA_IMAGE_COIN_COST + morphologyCost;
}
