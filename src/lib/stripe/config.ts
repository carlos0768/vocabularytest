// Stripe Configuration
// Prices are in JPY (Japanese Yen)

export const STRIPE_CONFIG = {
  plans: {
    pro: {
      id: 'pro_monthly',
      name: 'Proプラン',
      price: 300, // ¥300/month
      currency: 'JPY' as const,
      interval: 'month' as const,
      // Set in Stripe Dashboard — override via env var for flexibility
      priceId: process.env.STRIPE_PRICE_ID || '',
      features: [
        'スキャン無制限',
        'クラウド同期',
        'マルチデバイス対応',
        'データ永続化',
      ],
    },
  },

  freePlan: {
    dailyScanLimit: 3,
    wordLimit: 100,
  },

  paymentMethods: ['card'],
};

export type PlanId = keyof typeof STRIPE_CONFIG.plans;
