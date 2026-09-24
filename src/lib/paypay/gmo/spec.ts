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
 * 取引照会API名。通知を受けたあと「本当に課金されたか」をGMOに問い合わせる。
 * 署名の無い通知を信用しないための要なので、これが null の間は通知処理を止める。
 *
 * GMO回答により `SearchTrade.idPass` で確定。OrderID を鍵に引く API なので、
 * 通知処理も subscriptions の引き当ても OrderID が軸になる。
 *
 * 【未確認】GMO には決済手段をまたぐ `SearchTradeMulti` もある。PayPay の取引が
 * `SearchTrade` で引けない場合はこの定数を 'SearchTradeMulti' に変え、
 * PayType パラメータを searchGmoTrade に足す（それ以外の変更は要らない）。
 */
export const GMO_RECURRING_SEARCH_API: string | null = 'SearchTrade';

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

/**
 * 仕様が揃って通知処理を有効化できる状態かどうか。
 *
 * recurringId の項目名は条件に含めない — 照会も引き当ても OrderID で回るため、
 * 契約IDが分からなくても通知は正しく処理できる（解約APIを繋ぐときに必要になる）。
 * 残る必須条件は「照会API」と「Status の対応表」の2つ。
 */
export function isGmoRecurringSpecConfigured(): boolean {
  return (
    GMO_RECURRING_SEARCH_API !== null &&
    Object.keys(GMO_STATUS_TO_NOTIFICATION_TYPE).length > 0
  );
}
