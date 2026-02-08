// KOMOJU Configuration
// Prices are in JPY (Japanese Yen)

export const KOMOJU_CONFIG = {
  // API endpoints
  apiUrl: 'https://komoju.com/api/v1',

  // Plan configuration
  plans: {
    pro: {
      id: 'pro_monthly',
      name: 'Proプラン',
      price: 500, // ¥500/month
      currency: 'JPY',
      interval: 'month' as const,
      features: [
        'スキャン無制限',
        'クラウド同期',
        'マルチデバイス対応',
        'データ永続化',
      ],
    },
  },

  // Free plan limits
  freePlan: {
    dailyScanLimit: 3,
    wordLimit: 100,
  },

  // Payment methods to show
  paymentMethods: ['credit_card', 'paypay'],
};

export type PlanId = keyof typeof KOMOJU_CONFIG.plans;
