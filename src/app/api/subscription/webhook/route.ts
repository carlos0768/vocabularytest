import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { createCustomer, createSubscription, KOMOJU_CONFIG, verifyWebhookSignature } from '@/lib/komoju';

type JsonRecord = Record<string, unknown>;
type WebhookEvent = {
  id?: unknown;
  type?: unknown;
  data?: unknown;
};

type WebhookClaim = {
  shouldProcess: boolean;
};

class WebhookError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Lazy initialization of Supabase admin client
function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(url, key);
}

// POST /api/subscription/webhook
// Handles KOMOJU webhook events
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-komoju-signature');
    const webhookSecret = process.env.KOMOJU_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new WebhookError('Webhook secret not configured', 500);
    }

    if (!signature) {
      throw new WebhookError('Signature missing', 401);
    }

    if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
      throw new WebhookError('Invalid signature', 401);
    }

    let event: WebhookEvent;
    try {
      event = JSON.parse(payload) as WebhookEvent;
    } catch {
      throw new WebhookError('Invalid JSON payload', 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const eventType = getStringValue(event.type) ?? 'unknown';
    const eventId = deriveEventId(event, eventType);

    if (!eventId) {
      throw new WebhookError('Missing event id', 400);
    }

    const payloadHash = hashPayload(payload);
    const claim = await claimWebhookEvent(
      supabaseAdmin,
      eventId,
      eventType,
      payloadHash
    );

    if (!claim.shouldProcess) {
      return NextResponse.json({ received: true });
    }

    console.log('KOMOJU webhook event:', eventType, eventId);

    try {
      const eventData = asRecord(event.data);

      switch (eventType) {
        case 'payment.captured':
          if (!eventData) {
            throw new WebhookError('Invalid event data', 400);
          }
          await handlePaymentCaptured(supabaseAdmin, eventData);
          break;

        case 'payment.refunded':
          if (!eventData) {
            throw new WebhookError('Invalid event data', 400);
          }
          await handlePaymentRefunded(supabaseAdmin, eventData);
          break;

        case 'subscription.captured':
          if (!eventData) {
            throw new WebhookError('Invalid event data', 400);
          }
          await handleSubscriptionCaptured(supabaseAdmin, eventData);
          break;

        case 'subscription.canceled':
        case 'subscription.cancelled':
          if (!eventData) {
            throw new WebhookError('Invalid event data', 400);
          }
          await handleSubscriptionCanceled(supabaseAdmin, eventData);
          break;

        default:
          console.log('Unhandled event type:', event.type);
      }

      await markWebhookEventProcessed(supabaseAdmin, eventId, eventType, payloadHash);
      return NextResponse.json({ received: true });
    } catch (processingError) {
      const normalizedError = normalizeErrorMessage(processingError);
      await markWebhookEventFailed(
        supabaseAdmin,
        eventId,
        eventType,
        payloadHash,
        normalizedError
      );
      console.error('Webhook processing failed:', processingError);
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof WebhookError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handlePaymentCaptured(
  supabaseAdmin: SupabaseClient,
  data: JsonRecord
) {
  const metadata = asRecord(data.metadata);
  const userId = metadata ? getStringField(metadata, 'user_id') : null;

  if (!userId) {
    throw new WebhookError('No user_id in payment metadata', 400);
  }

  const planConfig = KOMOJU_CONFIG.plans.pro;
  const planId = metadata ? getStringField(metadata, 'plan_id') : null;

  if (metadata && getStringField(metadata, 'plan') !== 'pro') {
    throw new WebhookError('Payment is not for Pro plan', 400);
  }

  if (planId !== planConfig.id) {
    throw new WebhookError('Plan id mismatch', 400);
  }

  const amount = extractAmount(data);
  const currency = extractCurrency(data);

  if (amount === null || amount !== planConfig.price) {
    throw new WebhookError('Amount mismatch', 400);
  }

  if (!currency || currency !== planConfig.currency.toUpperCase()) {
    throw new WebhookError('Currency mismatch', 400);
  }

  const sessionId = extractSessionId(data);
  if (!sessionId) {
    throw new WebhookError('Missing session id', 400);
  }

  const { data: session, error: sessionError } = await supabaseAdmin
    .from('subscription_sessions')
    .select('id, user_id, plan_id, used_at, komoju_customer_id, komoju_subscription_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new WebhookError('Unknown session id', 400);
  }

  if (session.used_at) {
    console.log('payment.captured already processed for session:', sessionId);
    return;
  }

  if (session.user_id !== userId) {
    throw new WebhookError('Session user mismatch', 400);
  }

  if (session.plan_id !== planConfig.id) {
    throw new WebhookError('Session plan mismatch', 400);
  }

  const metadataCustomerId = metadata ? getStringField(metadata, 'customer_id') : null;
  let customerId = extractCustomerId(data) || session.komoju_customer_id || metadataCustomerId;

  if (!customerId) {
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData?.user?.email ?? null;
    if (userError || !email) {
      throw new WebhookError('Missing customer id and user email', 400);
    }
    const createdCustomer = await createCustomer(email, {
      user_id: userId,
      plan: 'pro',
    });
    customerId = createdCustomer.id;
  }

  let komojuSubscriptionId = session.komoju_subscription_id as string | null;

  if (!komojuSubscriptionId) {
    const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('komoju_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingSubscriptionError) {
      throw existingSubscriptionError;
    }

    komojuSubscriptionId = existingSubscription?.komoju_subscription_id ?? null;
  }

  if (!komojuSubscriptionId) {
    const createdSubscription = await createSubscription(customerId, {
      user_id: userId,
      plan: 'pro',
      plan_id: planConfig.id,
      session_id: sessionId,
    });
    komojuSubscriptionId = createdSubscription.id;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const periodStartIso = nowIso;
  const periodEndIso = addOneMonth(now).toISOString();

  const { error: sessionMetaError } = await supabaseAdmin
    .from('subscription_sessions')
    .update({
      komoju_customer_id: customerId,
      komoju_subscription_id: komojuSubscriptionId,
    })
    .eq('id', sessionId);

  if (sessionMetaError) {
    console.error('Failed to persist session metadata:', sessionMetaError);
    throw sessionMetaError;
  }

  const { error: updateError } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      plan: 'pro',
      pro_source: 'billing',
      test_pro_expires_at: null,
      komoju_customer_id: customerId,
      komoju_subscription_id: komojuSubscriptionId,
      current_period_start: periodStartIso,
      current_period_end: periodEndIso,
      cancel_at_period_end: false,
      cancel_requested_at: null,
      updated_at: nowIso,
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to update subscription:', updateError);
    throw updateError;
  }

  const { error: markError } = await supabaseAdmin
    .from('subscription_sessions')
    .update({ used_at: nowIso })
    .eq('id', sessionId);

  if (markError) {
    console.error('Failed to mark session as used:', markError);
    throw markError;
  }

  console.log(`Pro plan activated for user: ${userId}`);
}

async function handlePaymentRefunded(
  supabaseAdmin: SupabaseClient,
  data: JsonRecord
) {
  const metadata = asRecord(data.metadata);
  const planConfig = KOMOJU_CONFIG.plans.pro;
  const plan = metadata ? getStringField(metadata, 'plan') : null;
  const planId = metadata ? getStringField(metadata, 'plan_id') : null;

  if (plan && plan !== 'pro') {
    throw new WebhookError('Refund is not for Pro plan', 400);
  }

  if (planId && planId !== planConfig.id) {
    throw new WebhookError('Plan id mismatch', 400);
  }

  let userId = metadata ? getStringField(metadata, 'user_id') : null;
  if (!userId) {
    const komojuSubscriptionId = extractSubscriptionId(data);
    if (komojuSubscriptionId) {
      const { data: subscriptionRow } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('komoju_subscription_id', komojuSubscriptionId)
        .maybeSingle();
      userId = subscriptionRow?.user_id ?? null;
    }
  }

  if (!userId) {
    throw new WebhookError('No user_id in payment metadata', 400);
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      pro_source: 'billing',
      cancel_at_period_end: false,
      cancel_requested_at: null,
      current_period_end: nowIso,
      updated_at: nowIso,
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Subscription cancelled due to refund for user: ${userId}`);
}

async function handleSubscriptionCaptured(
  supabaseAdmin: SupabaseClient,
  data: JsonRecord
) {
  const komojuSubscriptionId = extractSubscriptionId(data);
  if (!komojuSubscriptionId) {
    throw new WebhookError('Missing subscription id', 400);
  }

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('komoju_subscription_id', komojuSubscriptionId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!subscriptionRow) {
    console.log('subscription.captured ignored: unknown subscription id', komojuSubscriptionId);
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const periodStartIso = extractPeriodStartIso(data) ?? nowIso;
  const periodEndIso = extractPeriodEndIso(data) ?? addOneMonth(now).toISOString();

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      pro_source: 'billing',
      test_pro_expires_at: null,
      current_period_start: periodStartIso,
      current_period_end: periodEndIso,
      cancel_at_period_end: false,
      cancel_requested_at: null,
      updated_at: nowIso,
    })
    .eq('komoju_subscription_id', komojuSubscriptionId);

  if (error) {
    throw error;
  }

  console.log(`Subscription period updated: ${komojuSubscriptionId}`);
}

async function handleSubscriptionCanceled(
  supabaseAdmin: SupabaseClient,
  data: JsonRecord
) {
  const komojuSubscriptionId = extractSubscriptionId(data);
  if (!komojuSubscriptionId) {
    throw new WebhookError('Missing subscription id', 400);
  }

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('komoju_subscription_id', komojuSubscriptionId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!subscriptionRow) {
    console.log('subscription.canceled ignored: unknown subscription id', komojuSubscriptionId);
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const periodEndIso = extractPeriodEndIso(data);
  const isFutureEnd = periodEndIso ? new Date(periodEndIso).getTime() > now.getTime() : false;

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(
      isFutureEnd
        ? {
            cancel_at_period_end: true,
            cancel_requested_at: nowIso,
            current_period_end: periodEndIso,
            updated_at: nowIso,
          }
        : {
            status: 'cancelled',
            pro_source: 'billing',
            cancel_at_period_end: false,
            cancel_requested_at: null,
            current_period_end: periodEndIso ?? nowIso,
            updated_at: nowIso,
          }
    )
    .eq('komoju_subscription_id', komojuSubscriptionId);

  if (error) {
    throw error;
  }

  console.log(`Subscription cancellation updated: ${komojuSubscriptionId}`);
}

function deriveEventId(event: WebhookEvent, eventType: string): string | null {
  const eventId = getStringValue(event.id);
  if (eventId) {
    return `event:${eventId}`;
  }

  const data = asRecord(event.data);
  const payment = data ? asRecord(data.payment) : null;
  const paymentId =
    (payment ? getStringField(payment, 'id') : null) ||
    (data ? getStringField(data, 'payment_id') : null) ||
    (data ? getStringField(data, 'id') : null) ||
    (payment ? getStringField(payment, 'payment_id') : null);

  if (paymentId) {
    return `payment:${eventType || 'unknown'}:${paymentId}`;
  }

  const subscriptionId = data ? extractSubscriptionId(data) : null;
  if (subscriptionId) {
    return `subscription:${eventType || 'unknown'}:${subscriptionId}`;
  }

  return null;
}

function extractAmount(data: JsonRecord): number | null {
  const payment = asRecord(data.payment);
  return (
    getNumberField(data, 'amount') ??
    (payment ? getNumberField(payment, 'amount') : null) ??
    (payment ? getNumberField(payment, 'total_amount') : null)
  );
}

function extractCurrency(data: JsonRecord): string | null {
  const payment = asRecord(data.payment);
  const currency =
    getStringField(data, 'currency') ??
    (payment ? getStringField(payment, 'currency') : null);
  return currency ? currency.toUpperCase() : null;
}

function extractSessionId(data: JsonRecord): string | null {
  const session = data.session;
  const metadata = asRecord(data.metadata);
  const payment = asRecord(data.payment);

  if (typeof session === 'string') {
    return session;
  }

  if (session && typeof session === 'object') {
    const sessionRecord = asRecord(session);
    const sessionId = sessionRecord ? getStringField(sessionRecord, 'id') : null;
    if (sessionId) {
      return sessionId;
    }
  }

  return (
    getStringField(data, 'session_id') ??
    (metadata ? getStringField(metadata, 'session_id') : null) ??
    (payment ? getStringField(payment, 'session_id') : null)
  );
}

function extractCustomerId(data: JsonRecord): string | null {
  const customer = data.customer;
  if (typeof customer === 'string') {
    return customer;
  }

  if (customer && typeof customer === 'object') {
    const customerRecord = asRecord(customer);
    return customerRecord ? getStringField(customerRecord, 'id') : null;
  }

  return getStringField(data, 'customer_id');
}

function extractSubscriptionId(data: JsonRecord): string | null {
  const subscription = asRecord(data.subscription);

  if (subscription) {
    const subscriptionId =
      getStringField(subscription, 'id') ??
      getStringField(subscription, 'subscription_id');
    if (subscriptionId) {
      return subscriptionId;
    }
  }

  return (
    getStringField(data, 'subscription_id') ??
    getStringField(data, 'id')
  );
}

function extractPeriodStartIso(data: JsonRecord): string | null {
  const subscription = asRecord(data.subscription);
  return (
    toIsoTimestamp(getStringField(data, 'current_period_start')) ??
    toIsoTimestamp(subscription ? getStringField(subscription, 'current_period_start') : null) ??
    toIsoTimestamp(getNumberField(data, 'current_period_start')) ??
    toIsoTimestamp(subscription ? getNumberField(subscription, 'current_period_start') : null)
  );
}

function extractPeriodEndIso(data: JsonRecord): string | null {
  const subscription = asRecord(data.subscription);
  return (
    toIsoTimestamp(getStringField(data, 'current_period_end')) ??
    toIsoTimestamp(subscription ? getStringField(subscription, 'current_period_end') : null) ??
    toIsoTimestamp(getStringField(data, 'next_capture_at')) ??
    toIsoTimestamp(subscription ? getStringField(subscription, 'next_capture_at') : null) ??
    toIsoTimestamp(getNumberField(data, 'current_period_end')) ??
    toIsoTimestamp(subscription ? getNumberField(subscription, 'current_period_end') : null)
  );
}

function toIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
      const date = new Date(millis);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function addOneMonth(base: Date): Date {
  const periodEnd = new Date(base);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return periodEnd;
}

function hashPayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

async function claimWebhookEvent(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  eventType: string,
  payloadHash: string
): Promise<WebhookClaim> {
  const { data, error } = await supabaseAdmin.rpc('claim_webhook_event', {
    p_id: eventId,
    p_type: eventType,
    p_payload_hash: payloadHash,
    p_stale_after_seconds: 300,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Failed to claim webhook event');
  }

  return {
    shouldProcess: Boolean((row as Record<string, unknown>).should_process),
  };
}

async function markWebhookEventProcessed(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  eventType: string,
  payloadHash: string
) {
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      type: eventType,
      payload_hash: payloadHash,
      status: 'processed',
      processed_at: nowIso,
      last_error: null,
      updated_at: nowIso,
    })
    .eq('id', eventId);

  if (error) {
    throw error;
  }
}

async function markWebhookEventFailed(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  eventType: string,
  payloadHash: string,
  lastError: string
) {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      type: eventType,
      payload_hash: payloadHash,
      status: 'failed',
      last_error: lastError,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    console.error('Failed to mark webhook as failed:', error);
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 2000);
  }
  return String(error).slice(0, 2000);
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getStringField(record: JsonRecord, key: string): string | null {
  return getStringValue(record[key]);
}

function getNumberField(record: JsonRecord, key: string): number | null {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
