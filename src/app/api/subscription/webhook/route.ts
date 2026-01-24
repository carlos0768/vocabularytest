import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { KOMOJU_CONFIG, verifyWebhookSignature } from '@/lib/komoju';

type JsonRecord = Record<string, unknown>;
type WebhookEvent = {
  id?: unknown;
  type?: unknown;
  data?: unknown;
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

    const { data: existingEvent, error: existingError } = await supabaseAdmin
      .from('webhook_events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingEvent) {
      return NextResponse.json({ received: true });
    }

    console.log('KOMOJU webhook event:', eventType, eventId);

    // Handle different event types
    let handled = false;
    const eventData = asRecord(event.data);

    switch (eventType) {
      // Payment captured - activate Pro plan
      case 'payment.captured':
        if (!eventData) {
          throw new WebhookError('Invalid event data', 400);
        }
        await handlePaymentCaptured(supabaseAdmin, eventData);
        handled = true;
        break;

      // Payment refunded - deactivate Pro plan
      case 'payment.refunded':
        if (!eventData) {
          throw new WebhookError('Invalid event data', 400);
        }
        await handlePaymentRefunded(supabaseAdmin, eventData);
        handled = true;
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    if (handled) {
      await recordWebhookEvent(supabaseAdmin, eventId, eventType);
    }

    return NextResponse.json({ received: true });
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

  // Check if this is a Pro plan payment
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
    .select('id, user_id, plan_id, used_at')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    throw new WebhookError('Unknown session id', 400);
  }

  if (session.used_at) {
    throw new WebhookError('Session already used', 409);
  }

  if (session.user_id !== userId) {
    throw new WebhookError('Session user mismatch', 400);
  }

  if (session.plan_id !== planConfig.id) {
    throw new WebhookError('Session plan mismatch', 400);
  }

  // Calculate subscription period (1 month from now)
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      plan: 'pro',
      komoju_customer_id: (asRecord(data.customer) && getStringField(asRecord(data.customer) as JsonRecord, 'id')) || null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  const { error: markError } = await supabaseAdmin
    .from('subscription_sessions')
    .update({ used_at: now.toISOString() })
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
  const userId = metadata ? getStringField(metadata, 'user_id') : null;

  if (!userId) {
    throw new WebhookError('No user_id in payment metadata', 400);
  }

  const planConfig = KOMOJU_CONFIG.plans.pro;
  const planId = metadata ? getStringField(metadata, 'plan_id') : null;

  if (metadata && getStringField(metadata, 'plan') !== 'pro') {
    throw new WebhookError('Refund is not for Pro plan', 400);
  }

  if (planId !== planConfig.id) {
    throw new WebhookError('Plan id mismatch', 400);
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Subscription cancelled due to refund for user: ${userId}`);
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

async function recordWebhookEvent(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  eventType: string
) {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .insert({ id: eventId, type: eventType });

  if (error && error.code !== '23505') {
    throw error;
  }
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
