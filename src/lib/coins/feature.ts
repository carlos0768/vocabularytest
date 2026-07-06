// サーバー専用の機能フラグ。NEXT_PUBLIC_ にしない —
// クライアントは /api/coins/me の `enabled` でオン/オフを知る。
export function isCoinSystemEnabled(): boolean {
  return process.env.COIN_SYSTEM_ENABLED === 'true';
}
