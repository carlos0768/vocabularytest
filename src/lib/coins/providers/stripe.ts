import { createOneTimeCheckoutSession } from '@/lib/stripe/client';
import type { CoinPurchaseProvider } from '../purchase-providers';

export const stripeCoinPurchaseProvider: CoinPurchaseProvider = {
  id: 'stripe',
  async createCheckout(params) {
    if (!params.pack.stripePriceId) {
      throw new Error(`Stripe price id is not configured for pack: ${params.pack.id}`);
    }

    const session = await createOneTimeCheckoutSession({
      priceId: params.pack.stripePriceId,
      customerEmail: params.userEmail,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      metadata: {
        purpose: 'coin_pack',
        user_id: params.userId,
        pack_id: params.pack.id,
      },
    });

    if (!session.url) {
      throw new Error('Stripe checkout session has no redirect URL');
    }

    return {
      redirectUrl: session.url,
      externalId: session.id,
      provider: 'stripe',
    };
  },
};
