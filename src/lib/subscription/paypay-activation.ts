import type { PayPayGatewayId } from '@/types';

// PayPay 継続課金の状態遷移。ゲートウェイ非依存 —
// GMO / KOMOJU それぞれの通知を NormalizedPayPayNotification に正規化するのは
// アダプタ側の責務で、「その通知で subscriptions 行がどう変わるか」だけをここに置く。
// appstore の resolveSubscriptionTransition と同じ形にしてあるので、
// 判定規則の差分がレビューで見える。

export type PayPayNotificationType =
  // 初回契約成立
  | 'subscription_activated'
  // 継続課金の請求成功（期間延長）
  | 'subscription_renewed'
  // 期間末解約の予約
  | 'subscription_cancel_scheduled'
  // 即時失効（契約解除・強制解約）
  | 'subscription_cancelled'
  // 継続課金の請求失敗
  | 'payment_failed'
  // 返金
  | 'refunded'
  // ゲートウェイの疎通テスト通知
  | 'test';

export type NormalizedPayPayNotification = {
  gateway: PayPayGatewayId;
  /** ゲートウェイ側イベントID。claim_webhook_event の冪等キーに使う */
  eventId: string;
  type: PayPayNotificationType;
  /** ゲートウェイの継続課金契約ID。subscriptions.paypay_subscription_id に対応 */
  subscriptionId: string;
  customerId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};

export type PayPaySubscriptionTransition = {
  status: 'active' | 'cancelled';
  cancelAtPeriodEnd: boolean;
  cancelRequestedAt: string | null;
  currentPeriodEnd: string | null;
};

const IMMEDIATE_CANCEL_TYPES = new Set<PayPayNotificationType>([
  'subscription_cancelled',
  'refunded',
]);

function isFutureIsoTimestamp(value: string | null, now: Date): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return false;
  return timestamp > now.getTime();
}

/**
 * 通知1件から subscriptions 行の遷移を決める。
 * null は「この通知では行を触らない」（テスト通知など）。
 *
 * 期間の権利が残っているかどうかは、通知が運んできた期限を優先し、
 * 無ければ DB 側の current_period_end で判断する。
 */
export function resolvePayPaySubscriptionTransition(
  notification: NormalizedPayPayNotification,
  currentPeriodEnd: string | null,
  now: Date = new Date()
): PayPaySubscriptionTransition | null {
  if (notification.type === 'test') {
    return null;
  }

  const effectivePeriodEnd = notification.currentPeriodEnd ?? currentPeriodEnd;

  // 解除・返金は権利を即座に落とす。期間が残っていても継続させない。
  if (IMMEDIATE_CANCEL_TYPES.has(notification.type)) {
    return {
      status: 'cancelled',
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
      currentPeriodEnd: effectivePeriodEnd,
    };
  }

  // 期間末解約は「予約」であって失効ではない。期間が残っている限り active のまま。
  if (notification.type === 'subscription_cancel_scheduled') {
    const stillEntitled = isFutureIsoTimestamp(effectivePeriodEnd, now);
    return {
      status: stillEntitled ? 'active' : 'cancelled',
      cancelAtPeriodEnd: stillEntitled,
      cancelRequestedAt: stillEntitled ? now.toISOString() : null,
      currentPeriodEnd: effectivePeriodEnd,
    };
  }

  // 請求失敗は即失効にしない — ゲートウェイ側のリトライ中に権利を奪うと、
  // 支払い直後の再課金成功で Pro が一度落ちてから戻る挙動になる。
  // 期間が切れて初めて cancelled に落とす（App Store の DID_FAIL_TO_RENEW と同じ）。
  if (notification.type === 'payment_failed') {
    return {
      status: isFutureIsoTimestamp(effectivePeriodEnd, now) ? 'active' : 'cancelled',
      cancelAtPeriodEnd: false,
      cancelRequestedAt: null,
      currentPeriodEnd: effectivePeriodEnd,
    };
  }

  // activated / renewed。期限を運んでこない通知は、後段の照会で埋める前提で
  // DB 側の値を据え置く（ここで勝手に1ヶ月足さない — 未課金の権利を作るため）。
  return {
    status: 'active',
    cancelAtPeriodEnd: false,
    cancelRequestedAt: null,
    currentPeriodEnd: effectivePeriodEnd,
  };
}

export type PayPaySubscriptionUpdate = {
  status: 'active' | 'cancelled';
  plan: 'pro' | 'free';
  pro_source: 'paypay';
  test_pro_expires_at: null;
  paypay_provider: PayPayGatewayId;
  paypay_subscription_id: string;
  paypay_customer_id: string | null;
  paypay_last_verified_at: string;
  /** 通知が開始日を運んでこないときは既存値を保つため、キー自体を落とす */
  current_period_start?: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_requested_at: string | null;
  updated_at: string;
};

/**
 * 遷移を subscriptions の UPDATE ペイロードに変換する。
 *
 * cancelled でも plan は 'pro' のまま残す。Pro を一度でも使ったユーザーは
 * wasProUser() で読み取り専用リポジトリに落ちる必要があり、plan を 'free' に
 * 戻すとその判定が壊れてクラウド上の単語帳が見えなくなる。
 */
export function buildPayPaySubscriptionUpdate(
  notification: NormalizedPayPayNotification,
  transition: PayPaySubscriptionTransition,
  now: Date = new Date()
): PayPaySubscriptionUpdate {
  const nowIso = now.toISOString();

  return {
    status: transition.status,
    plan: 'pro',
    pro_source: 'paypay',
    test_pro_expires_at: null,
    paypay_provider: notification.gateway,
    paypay_subscription_id: notification.subscriptionId,
    paypay_customer_id: notification.customerId,
    paypay_last_verified_at: nowIso,
    // 解約通知は開始日を運んでこないことが多い。null で上書きすると
    // 初回契約日を失うので、値があるときだけ書く。
    ...(notification.currentPeriodStart
      ? { current_period_start: notification.currentPeriodStart }
      : {}),
    current_period_end: transition.currentPeriodEnd,
    cancel_at_period_end: transition.cancelAtPeriodEnd,
    cancel_requested_at: transition.cancelRequestedAt,
    updated_at: nowIso,
  };
}
