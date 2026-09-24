import { STRIPE_CONFIG } from '@/lib/stripe/config';
import type { NormalizedPayPayNotification } from '@/lib/subscription/paypay-activation';
import { callGmoApi } from './client';
import { getGmoConfig, type GmoConfig } from './config';
import type { GmoResponseBody } from './response';
import { GMO_RECURRING_SEARCH_API, resolveGmoNotificationType } from './spec';

// GMO 取引照会 (SearchTrade)。
//
// 署名の無い結果通知を信用しないための「再照会」がこれ。通知は
// 「この OrderID を見に行け」という合図としてだけ使い、課金状態は
// すべてこの応答から決める。通知本文の Status / Amount は捨てる。

export class GmoSearchTradeError extends Error {}

export type GmoTradeState = {
  orderId: string;
  status: string;
  amount: number | null;
  /** GMO 側が採番する継続課金契約の識別子（応答に含まれる場合） */
  recurringId: string | null;
  processDate: string | null;
};

/** Pro 月額の期待金額。照会結果がこれと違えば有効化しない。 */
export const EXPECTED_PRO_AMOUNT_JPY = STRIPE_CONFIG.plans.pro.price;

function pickFirst(body: GmoResponseBody, keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key]?.trim();
    if (value) return value;
  }
  return null;
}

/**
 * GMO の `ProcessDate` (YYYYMMDDHHMMSS, JST) を ISO 文字列にする。
 * GMO はタイムゾーンを付けないので JST (+09:00) として解釈する。
 */
export function parseGmoProcessDate(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value || !/^\d{14}$/.test(value)) {
    return null;
  }
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value)!;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function searchGmoTrade(
  orderId: string,
  config: GmoConfig = getGmoConfig(),
  call: typeof callGmoApi = callGmoApi
): Promise<GmoTradeState> {
  if (!GMO_RECURRING_SEARCH_API) {
    throw new GmoSearchTradeError('GMO search API is not configured');
  }

  const body = await call(
    GMO_RECURRING_SEARCH_API,
    {
      ShopID: config.shopId,
      ShopPass: config.shopPass,
      OrderID: orderId,
    },
    config
  );

  const status = body.Status?.trim();
  if (!status) {
    throw new GmoSearchTradeError(`SearchTrade returned no Status for order ${orderId}`);
  }

  const rawAmount = body.Amount?.trim();
  const amount = rawAmount && /^\d+$/.test(rawAmount) ? Number(rawAmount) : null;

  return {
    // 応答の OrderID を優先する。問い合わせた値をそのまま返すと、
    // 別の取引が返ってきたときに気付けない。
    orderId: body.OrderID?.trim() || orderId,
    status,
    amount,
    // 契約IDの項目名は仕様書待ち。候補を順に見て、無ければ null。
    recurringId: pickFirst(body, ['RecurringID', 'RegistrationNo', 'TranID']),
    processDate: parseGmoProcessDate(body.ProcessDate),
  };
}

/**
 * 課金1回ぶんの権利期間 = 支払日 + 1ヶ月。
 *
 * 月末をまたぐときは月末に丸める。素の setMonth は 1/31 + 1ヶ月 を 3/3 にしてしまい、
 * 2月ぶんを丸ごと余計に与えることになる。
 */
export function addOneBillingMonth(iso: string): string {
  const from = new Date(iso);
  const day = from.getUTCDate();
  const target = new Date(from);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + 1);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));

  return target.toISOString();
}

const ENTITLEMENT_GRANTING_TYPES = new Set(['subscription_activated', 'subscription_renewed']);

/**
 * 照会結果を内部表現へ正規化する。
 *
 * 金額が期待値と違うものは通さない。¥1 の決済を通知させて Pro を有効化する、
 * といった経路を塞ぐため（照会が本物でも「正しい商品の支払い」とは限らない）。
 */
export function normalizeGmoTradeState(
  trade: GmoTradeState,
  eventId: string
): NormalizedPayPayNotification {
  // 金額を先に見る。Status の語彙を理解できなくても、金額が違う取引は
  // その時点で拒否できる（Status 対応表が埋まる前でも効く防御になる）。
  if (trade.amount !== null && trade.amount !== EXPECTED_PRO_AMOUNT_JPY) {
    throw new GmoSearchTradeError(
      `SearchTrade amount ${trade.amount} does not match the Pro plan price ${EXPECTED_PRO_AMOUNT_JPY} (order ${trade.orderId})`
    );
  }

  const type = resolveGmoNotificationType(trade.status);
  if (!type) {
    throw new GmoSearchTradeError(
      `SearchTrade status has no mapping: ${trade.status} (order ${trade.orderId})`
    );
  }

  // 照会で「期待どおりの金額の支払いが成立している」ことを確認できた課金だけ、
  // 支払日から1ヶ月ぶんの権利を与える。ここで延ばさないと、更新課金のたびに
  // 期間が据え置かれ、払っているのに Pro が切れる。
  // 逆に、解約・返金・請求失敗の通知では決して延ばさない。
  const currentPeriodEnd =
    ENTITLEMENT_GRANTING_TYPES.has(type) && trade.processDate
      ? addOneBillingMonth(trade.processDate)
      : null;

  return {
    gateway: 'gmo',
    eventId,
    type,
    // 契約IDが取れないうちは OrderID を契約の識別子として使う。
    // どちらも一意にユーザーへ紐づくので、解約APIの仕様が来たら差し替える。
    subscriptionId: trade.recurringId ?? trade.orderId,
    customerId: null,
    currentPeriodStart: trade.processDate,
    currentPeriodEnd,
  };
}
