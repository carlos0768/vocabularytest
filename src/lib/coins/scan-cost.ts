import type { ExtractMode } from '@/lib/scan/mode-provider';
import { computeScanCoinCost } from './rates';

export interface ScanCoinStateInput {
  /** /api/coins/me の enabled（コイン制のオン/オフ。未取得は null）。 */
  enabled: boolean | null;
  isPro: boolean;
  modes: ExtractMode[];
  /** 現時点の画像枚数。未撮影でも最低1枚として見積もる。 */
  imageCount: number;
  totalRemaining: number;
  /** 語源解析（+2コイン）オプションの有効状態。 */
  includeMorphology?: boolean;
}

export interface ScanCoinState {
  /** コスト行を表示すべきか（コイン制オン かつ Pro）。 */
  showCost: boolean;
  /** 見積り消費コイン。表示対象外のときは null。 */
  cost: number | null;
  /** 残高不足でスキャンをブロックすべきか。 */
  insufficient: boolean;
}

/**
 * コスト表示・残高不足判定を1箇所に集約した純粋関数。
 * モバイル（ScanCapturePanel / MultiShotCaptureView）とデスクトップ
 * （DesktopScan）が同一ロジックを使うことで表示のドリフトを防ぐ。
 * React 非依存なので単体テスト可能。
 */
export function deriveScanCoinState(input: ScanCoinStateInput): ScanCoinState {
  if (input.enabled !== true || !input.isPro) {
    return { showCost: false, cost: null, insufficient: false };
  }

  let cost: number | null;
  try {
    cost = computeScanCoinCost(input.modes, Math.max(1, Math.floor(input.imageCount || 1)), {
      includeMorphology: input.includeMorphology === true,
    });
  } catch {
    // モード未選択等、コストを算出できない状態ではブロックしない
    return { showCost: false, cost: null, insufficient: false };
  }

  return {
    showCost: true,
    cost,
    insufficient: input.totalRemaining < cost,
  };
}
