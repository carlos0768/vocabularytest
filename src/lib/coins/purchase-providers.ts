import type { CoinPack } from './packs';
import { stripeCoinPurchaseProvider } from './providers/stripe';

// コインパック購入プロバイダの最小抽象。
// クレジット処理は抽象に含めない — どのプロバイダも Webhook/コールバックの先で
// 同じ credit_coin_pack RPC（service role）に合流する。
// Phase 2 で GMO PayPay を 'gmo_paypay' としてレジストリに追加する。

export type CoinPurchaseProviderId = 'stripe' | 'gmo_paypay';

export interface CoinCheckoutParams {
  userId: string;
  userEmail: string | null;
  pack: CoinPack;
  successUrl: string;
  cancelUrl: string;
}

export interface CoinCheckoutResult {
  redirectUrl: string;
  externalId: string;
  provider: CoinPurchaseProviderId;
}

export interface CoinPurchaseProvider {
  id: CoinPurchaseProviderId;
  createCheckout(params: CoinCheckoutParams): Promise<CoinCheckoutResult>;
}

const providers: Partial<Record<CoinPurchaseProviderId, CoinPurchaseProvider>> = {
  stripe: stripeCoinPurchaseProvider,
};

export function getCoinPurchaseProvider(id: CoinPurchaseProviderId): CoinPurchaseProvider {
  const provider = providers[id];
  if (!provider) {
    throw new Error(`coin purchase provider not available: ${id}`);
  }
  return provider;
}
