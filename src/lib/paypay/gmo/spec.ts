import type { PayPayNotificationType } from '@/lib/subscription/paypay-activation';

// ============================================================================
// GMO PG 仕様書に依存する定数は**すべてこのファイルに閉じる**。
//
// 加盟店ごとに交付される「PayPay継続課金」のインターフェース仕様書を受領したら、
// ここだけを埋めれば他のモジュールは変更不要になるようにしてある。
// 未確定のものは空/未対応のままにしてあり、fail-closed で動く
// （＝誤ったマッピングで課金状態を書き換えるくらいなら、何もせず警告を出す）。
// ============================================================================

/**
 * 結果通知の Status → 内部イベント種別の対応表。
 *
 * 【要仕様確認】PayPay継続課金の通知で実際に飛ぶ Status 値を仕様書で確認して埋める。
 * GMO は決済手段ごとに Status の語彙が異なるため、カード決済の値を流用してはいけない。
 *
 * 空のままでも通知ルートは動く（未知 Status として無視し警告ログを出す）ので、
 * 疎通テストで実際に飛んできた値をログから拾って埋めるのが確実。
 */
export const GMO_STATUS_TO_NOTIFICATION_TYPE: Readonly<
  Record<string, PayPayNotificationType>
> = Object.freeze({
  // 例（要確認・現時点では未適用）:
  // PAYSUCCESS:  'subscription_renewed',
  // PAYFAIL:     'payment_failed',
  // CANCEL:      'subscription_cancelled',
  // RETURNED:    'refunded',
});

export function resolveGmoNotificationType(
  status: string | null | undefined
): PayPayNotificationType | null {
  const key = status?.trim();
  if (!key) return null;
  return GMO_STATUS_TO_NOTIFICATION_TYPE[key] ?? null;
}

/**
 * 継続課金契約の照会に使う API 名。
 *
 * 【要仕様確認】通知を受けたあとに「本当に課金されたか」をGMOへ問い合わせる
 * 取引照会APIの名前。これが確定するまで再照会ができないため、
 * 通知ルートは有効化できない（意図的にそうしてある — 照会なしで
 * 署名なし通知を信じると、偽通知でPro有効化ができてしまう）。
 */
export const GMO_RECURRING_SEARCH_API: string | null = null;

/** 契約作成・解約に使う API 名。【要仕様確認】 */
export const GMO_RECURRING_REGISTER_API: string | null = null;
export const GMO_RECURRING_CANCEL_API: string | null = null;

/**
 * 通知本文から値を取り出すキー名。
 * OrderID / Status / Amount は GMO 共通だが、継続課金契約IDの項目名は
 * サービスによって異なる（RecurringID / RegistrationNo など）。【要仕様確認】
 */
export const GMO_NOTIFICATION_FIELDS = Object.freeze({
  orderId: 'OrderID',
  status: 'Status',
  amount: 'Amount',
  /** 【要仕様確認】継続課金契約の識別子 */
  recurringId: null as string | null,
});

/** 仕様が揃って通知処理を有効化できる状態かどうか。 */
export function isGmoRecurringSpecConfigured(): boolean {
  return (
    GMO_RECURRING_SEARCH_API !== null &&
    GMO_NOTIFICATION_FIELDS.recurringId !== null &&
    Object.keys(GMO_STATUS_TO_NOTIFICATION_TYPE).length > 0
  );
}
