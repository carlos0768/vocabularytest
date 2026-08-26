import type { PayPayGatewayId } from '@/types';

// PayPay 継続課金（Pro月額）の設定。
//
// Stripe は PayPay を単発決済でしか扱えない（コインパックはそれで足りる）ため、
// Pro の月額課金だけは国内ゲートウェイを別に通す。どのゲートウェイを使うかは
// 実装ではなく設定で決める — DB 側も pro_source='paypay' + paypay_provider の
// 2列に分けてあり、乗り換えてもマイグレーションは要らない。
//
// Phase 1 ではフラグは既定 OFF。ゲートウェイの加盟店契約と資格情報が揃うまで
// 課金導線を出さないための封じ込めで、フラグを立てるまで /subscription の
// PayPay 選択肢もサーバー側の受け口も一切現れない。

export const PAYPAY_GATEWAYS: readonly PayPayGatewayId[] = ['gmo', 'komoju'] as const;

export function isPayPayGatewayId(value: string | null | undefined): value is PayPayGatewayId {
  return typeof value === 'string' && (PAYPAY_GATEWAYS as readonly string[]).includes(value);
}

// 明示的に 'true' のときだけ有効。未設定・空文字・タイポはすべて OFF に倒す。
export function isPayPaySubscriptionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.PAYPAY_SUBSCRIPTION_ENABLED === 'true';
}

// 設定されたゲートウェイ。未設定・未知の値は null（＝未設定扱い）を返し、
// 呼び出し側が 404/500 に落とせるようにする。既定値は置かない —
// 取り違えたゲートウェイに課金リクエストを飛ばすくらいなら失敗させる。
export function getPayPayGateway(
  env: NodeJS.ProcessEnv = process.env
): PayPayGatewayId | null {
  const value = env.PAYPAY_GATEWAY?.trim();
  return isPayPayGatewayId(value) ? value : null;
}
