import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { KOMOJU_CONFIG, verifyWebhookSignature } from '@/lib/komoju';

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

    let event: any;
    try {
      event = JSON.parse(payload);
    } catch (parseError) {
      throw new WebhookError('Invalid JSON payload', 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const eventId = deriveEventId(event);

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

    console.log('KOMOJU webhook event:', event.type, eventId);

    // Handle different event types
    let handled = false;

    switch (event.type) {
      // Payment captured - activate Pro plan
      case 'payment.captured':
        await handlePaymentCaptured(supabaseAdmin, event.data);
        handled = true;
        break;

      // Payment refunded - deactivate Pro plan
      case 'payment.refunded':
        await handlePaymentRefunded(supabaseAdmin, event.data);
        handled = true;
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    if (handled) {
      await recordWebhookEvent(supabaseAdmin, eventId, event.type);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentCaptured(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;

  if (!userId) {
    throw new WebhookError('No user_id in payment metadata', 400);
  }

  // Check if this is a Pro plan payment
  const planConfig = KOMOJU_CONFIG.plans.pro;
  const planId = data.metadata?.plan_id;

  if (data.metadata?.plan !== 'pro') {
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
      komoju_customer_id: data.customer?.id || null,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentRefunded(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;

  if (!userId) {
    throw new WebhookError('No user_id in payment metadata', 400);
  }

  const planConfig = KOMOJU_CONFIG.plans.pro;
  const planId = data.metadata?.plan_id;

  if (data.metadata?.plan !== 'pro') {
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

function deriveEventId(event: any): string | null {
  if (event?.id) {
    return `event:${event.id}`;
  }

  const paymentId =
    event?.data?.payment?.id ||
    event?.data?.payment_id ||
    event?.data?.id ||
    event?.data?.payment?.payment_id;

  if (paymentId) {
    return `payment:${event?.type || 'unknown'}:${paymentId}`;
  }

  return null;
}

function extractAmount(data: any): number | null {
  const raw = data?.amount ?? data?.payment?.amount ?? data?.payment?.total_amount;
  const amount = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(amount) ? Number(amount) : null;
}

function extractCurrency(data: any): string | null {
  const raw = data?.currency ?? data?.payment?.currency;
  return typeof raw === 'string' ? raw.toUpperCase() : null;
}

function extractSessionId(data: any): string | null {
  const raw =
    data?.session_id ||
    data?.session?.id ||
    data?.metadata?.session_id ||
    data?.payment?.session_id;

  return typeof raw === 'string' ? raw : null;
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
