export interface CoinPack {
  id: string;
  name: string;
  coins: number;
  price: number; // JPY
  stripePriceId: string;
}

// Stripe ダッシュボードで one-time Price を作成し、環境変数に設定する。
// PayPay はダッシュボードで有効化すれば Checkout に自動表示される（単発のみ）。
export function getCoinPacks(): CoinPack[] {
  return [
    {
      id: 'coins_100',
      name: 'コイン100枚',
      coins: 100,
      price: 150,
      stripePriceId: process.env.STRIPE_COIN_PACK_100_PRICE_ID || '',
    },
    {
      id: 'coins_300',
      name: 'コイン300枚',
      coins: 300,
      price: 400,
      stripePriceId: process.env.STRIPE_COIN_PACK_300_PRICE_ID || '',
    },
    {
      id: 'coins_1000',
      name: 'コイン1000枚',
      coins: 1000,
      price: 1200,
      stripePriceId: process.env.STRIPE_COIN_PACK_1000_PRICE_ID || '',
    },
  ];
}

export function getCoinPack(packId: string): CoinPack | null {
  return getCoinPacks().find((pack) => pack.id === packId) ?? null;
}
