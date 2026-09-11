import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSingleLineEnv } from '@/lib/env';
import { getPayPayGateway, isPayPaySubscriptionEnabled } from '@/lib/paypay/config';
import { getGmoConfig } from '@/lib/paypay/gmo/config';
import {
  checkGmoNotificationIp,
  resolveGmoClientIp,
} from '@/lib/paypay/gmo/notification-trust';
import {
  GMO_NOTIFICATION_FIELDS,
  isGmoRecurringSpecConfigured,
  resolveGmoNotificationType,
} from '@/lib/paypay/gmo/spec';
import {
  buildPayPaySubscriptionUpdate,
  resolvePayPaySubscriptionTransition,
  type NormalizedPayPayNotification,
} from '@/lib/subscription/paypay-activation';
import {
  claimWebhookEvent,
  hashPayload,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from '@/lib/webhooks/event-log';

// POST /api/subscription/paypay/notifications
// GMO PG の結果通知の受け口。
//
// GMO の通知には署名が無い（Stripe の INV-05・App Store の JWS に相当するものが無い）。
// そのため本文の決済状態は一切信用せず、次の順序で処理する:
//
//   1. フラグ・ゲートウェイ設定を確認（未設定なら存在しないものとして 404）
//   2. 送信元IPを許可リストと照合（未設定なら全拒否）
//   3. claim_webhook_event で冪等性を確保
//   4. GMOへ再照会して課金状態を確定 ← ここが本命の防御
//   5. 確定した状態だけを subscriptions に反映
//
// 4 を省くと、許可IPを詐称できた相手が本文を書くだけで Pro を有効化できる。
// 再照会APIが未確定の間は 5 に到達しないよう fail-closed にしてある。

export type PayPayNotificationDeps = {
  createSupabaseAdmin: () => SupabaseClient;
  claimWebhookEventFn: typeof claimWebhookEvent;
  markWebhookEventProcessedFn: typeof markWebhookEventProcessed;
  markWebhookEventFailedFn: typeof markWebhookEventFailed;
  hashPayloadFn: typeof hashPayload;
  /**
   * 通知で示された契約をGMOに問い合わせ、確定した状態を返す。
   * 【Phase 2b】GMO_RECURRING_SEARCH_API が確定したら実装を差し込む。
   */
  fetchAuthoritativeState: (
    recurringId: string,
    orderId: string
  ) => Promise<NormalizedPayPayNotification>;
  now: () => Date;
};

function getSupabaseAdmin(): SupabaseClient {
  const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  return createSupabaseClient(url, key);
}

async function specNotConfigured(): Promise<NormalizedPayPayNotification> {
  throw new Error(
    'GMO recurring search API is not configured — refusing to trust an unsigned notification'
  );
}

const defaultDeps: PayPayNotificationDeps = {
  createSupabaseAdmin: getSupabaseAdmin,
  claimWebhookEventFn: claimWebhookEvent,
  markWebhookEventProcessedFn: markWebhookEventProcessed,
  markWebhookEventFailedFn: markWebhookEventFailed,
  hashPayloadFn: hashPayload,
  fetchAuthoritativeState: specNotConfigured,
  now: () => new Date(),
};

export function parseGmoNotificationBody(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

/**
 * 通知1件の識別子。GMO は Stripe の event.id にあたる値を持たないため、
 * 「契約 + 注文 + 状態」を連結して冪等キーにする。同じ状態変化の再送は
 * 同じキーになり、別の状態変化は別のキーになる。
 */
export function buildGmoEventId(body: Record<string, string>): string | null {
  const orderId = body[GMO_NOTIFICATION_FIELDS.orderId]?.trim();
  const status = body[GMO_NOTIFICATION_FIELDS.status]?.trim();
  if (!orderId || !status) {
    return null;
  }
  return `gmo:${orderId}:${status}`;
}

export async function handlePayPayNotificationRequest(
  request: Request,
  deps: PayPayNotificationDeps = defaultDeps
): Promise<NextResponse> {
  // 1. 機能が閉じている間は経路そのものを存在させない。
  if (!isPayPaySubscriptionEnabled() || getPayPayGateway() !== 'gmo') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let config;
  try {
    config = getGmoConfig();
  } catch (error) {
    console.error('[PayPay notification] GMO config missing', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  // 2. 送信元IP。署名が無いぶん、ここが唯一の入口フィルタになる。
  const clientIp = resolveGmoClientIp(request.headers);
  const ipCheck = checkGmoNotificationIp(clientIp, config.notificationIpAllowlist);
  if (!ipCheck.allowed) {
    console.warn('[PayPay notification] rejected by IP allowlist', {
      reason: ipCheck.reason,
      // IPはログに残すが、本文は攻撃者の入力なので出さない
      clientIp,
    });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = await request.text();
  const body = parseGmoNotificationBody(payload);

  const eventId = buildGmoEventId(body);
  if (!eventId) {
    console.warn('[PayPay notification] missing OrderID/Status');
    return NextResponse.json({ error: 'Invalid notification' }, { status: 400 });
  }

  const notificationType = resolveGmoNotificationType(
    body[GMO_NOTIFICATION_FIELDS.status]
  );
  const eventType = `gmo.${body[GMO_NOTIFICATION_FIELDS.status] ?? 'unknown'}`;

  // 仕様未確定 / 未知の Status は、状態を書き換えずに 200 を返す。
  // 4xx/5xx を返すとGMO側がリトライを繰り返すだけで、こちらは
  // 正しく処理できるようにならない。ログに残して人間が拾う。
  if (!isGmoRecurringSpecConfigured() || !notificationType) {
    console.warn('[PayPay notification] no mapping for status — ignored', {
      eventId,
      status: body[GMO_NOTIFICATION_FIELDS.status],
      specConfigured: isGmoRecurringSpecConfigured(),
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const supabaseAdmin = deps.createSupabaseAdmin();
  const payloadHash = deps.hashPayloadFn(payload);

  // 3. 冪等性。GMO は通知を再送するため、同じ状態変化を二度適用しない。
  const claim = await deps.claimWebhookEventFn(supabaseAdmin, {
    eventId,
    eventType,
    payloadHash,
  });
  if (!claim.shouldProcess) {
    return NextResponse.json({ received: true });
  }

  try {
    const recurringIdField = GMO_NOTIFICATION_FIELDS.recurringId;
    const recurringId = recurringIdField ? body[recurringIdField]?.trim() : '';
    if (!recurringId) {
      throw new Error('Notification carries no recurring contract id');
    }

    // 4. 再照会。ここから先で使うのは通知本文ではなく GMO の応答だけ。
    const authoritative = await deps.fetchAuthoritativeState(
      recurringId,
      body[GMO_NOTIFICATION_FIELDS.orderId]
    );

    const { data: subscription, error: lookupError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, current_period_end')
      .eq('paypay_provider', 'gmo')
      .eq('paypay_subscription_id', authoritative.subscriptionId)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }
    if (!subscription) {
      throw new Error(
        `Subscription not found for recurring contract: ${authoritative.subscriptionId}`
      );
    }

    const now = deps.now();
    const transition = resolvePayPaySubscriptionTransition(
      authoritative,
      subscription.current_period_end as string | null,
      now
    );

    // 5. 反映。
    if (transition) {
      const update = buildPayPaySubscriptionUpdate(authoritative, transition, now);
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update(update)
        .eq('user_id', subscription.user_id as string);

      if (updateError) {
        throw updateError;
      }
    }

    await deps.markWebhookEventProcessedFn(supabaseAdmin, {
      eventId,
      eventType,
      payloadHash,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
    await deps.markWebhookEventFailedFn(supabaseAdmin, {
      eventId,
      eventType,
      payloadHash,
      lastError: message,
    });
    console.error('[PayPay notification] processing failed', { eventId, error: message });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handlePayPayNotificationRequest(request);
}
