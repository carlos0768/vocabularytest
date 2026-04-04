import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { constructWebhookEvent, STRIPE_CONFIG } from '@/lib/stripe';
import { activateBillingFromSession } from '@/lib/subscription/billing-activation';
import {
  claimWebhookEvent,
  hashPayload,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from '@/lib/webhooks/event-log';

type SessionLookupRow = {
  id: string;
  user_id: string;
  plan_id: string;
  created_at: string;
  used_at: string | null;
};

class WebhookError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new WebhookError('Webhook secret not configured', 500);
    }

    if (!signature) {
      console.error('[Stripe webhook] signature missing');
      throw new WebhookError('Signature missing', 401);
    }

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(payload, signature, webhookSecret);
    } catch (err) {
      console.error('[Stripe webhook] signature verification failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw new WebhookError('Invalid signature', 401);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const eventId = event.id;
    const eventType = event.type;

    const payloadHash = hashPayload(payload);
    const claim = await claimWebhookEvent(supabaseAdmin, {
      eventId,
      eventType,
      payloadHash,
    });
    if (!claim.shouldProcess) {
      return NextResponse.json({ received: true });
    }

    console.log('Stripe webhook event:', eventType, eventId);

    try {
      switch (eventType) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(
            supabaseAdmin,
            event.data.object as Stripe.Checkout.Session
          );
          break;

        case 'invoice.paid':
          await handleInvoicePaid(
            supabaseAdmin,
            event.data.object as Stripe.Invoice
          );
          break;

        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(
            supabaseAdmin,
            event.data.object as Stripe.Invoice
          );
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(
            supabaseAdmin,
            event.data.object as Stripe.Subscription
          );
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(
            supabaseAdmin,
            event.data.object as Stripe.Subscription
          );
          break;

        case 'charge.refunded':
          await handleChargeRefunded(
            supabaseAdmin,
            event.data.object as Stripe.Charge
          );
          break;

        default:
          console.log('Unhandled event type:', eventType);
      }

      await markWebhookEventProcessed(supabaseAdmin, {
        eventId,
        eventType,
        payloadHash,
      });
      return NextResponse.json({ received: true });
    } catch (processingError) {
      const normalizedError =
        processingError instanceof Error
          ? processingError.message.slice(0, 2000)
          : String(processingError).slice(0, 2000);
      await markWebhookEventFailed(supabaseAdmin, {
        eventId,
        eventType,
        payloadHash,
        lastError: normalizedError,
      });
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

// ============================================
// checkout.session.completed
// Initial subscription activation from Checkout
// ============================================
async function handleCheckoutSessionCompleted(
  supabaseAdmin: SupabaseClient,
  session: Stripe.Checkout.Session
) {
  if (session.mode !== 'subscription') {
    return;
  }

  const userId = session.metadata?.user_id;
  if (!userId) {
    throw new WebhookError('No user_id in session metadata', 400);
  }

  const planId = session.metadata?.plan_id;
  if (planId !== STRIPE_CONFIG.plans.pro.id) {
    throw new WebhookError('Plan id mismatch', 400);
  }

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null;

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;

  // The session.id here is the Stripe Checkout Session ID, which was stored as
  // the subscription_sessions.id when creating the checkout session.
  const dbSessionId = session.id;

  await activateBillingFromSession(supabaseAdmin, {
    sessionId: dbSessionId,
    userId,
    customerIdFromEvent: customerId,
    subscriptionIdFromEvent: subscriptionId,
    eventType: 'checkout.session.completed',
    context: 'webhook',
  });

  console.log('[Stripe webhook] billing activated via checkout.session.completed', {
    userId,
    sessionId: dbSessionId,
  });
}

// ============================================
// invoice.paid
// Handles recurring subscription renewals
// ============================================
async function handleInvoicePaid(
  supabaseAdmin: SupabaseClient,
  invoice: Stripe.Invoice
) {
  // Skip the first invoice — handled by checkout.session.completed
  if (invoice.billing_reason === 'subscription_create') {
    return;
  }

  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  if (!stripeSubscriptionId) {
    throw new WebhookError('Missing subscription id in invoice', 400);
  }

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!subscriptionRow) {
    console.warn('[Stripe webhook] invoice.paid for unknown subscription', stripeSubscriptionId);
    return;
  }

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  const periodStart = invoice.lines?.data?.[0]?.period?.start;
  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      pro_source: 'billing',
      test_pro_expires_at: null,
      current_period_start: periodStart
        ? new Date(periodStart * 1000).toISOString()
        : nowIso,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : nowIso,
      cancel_at_period_end: false,
      cancel_requested_at: null,
      updated_at: nowIso,
    })
    .eq('stripe_subscription_id', stripeSubscriptionId);

  if (error) throw error;

  console.log('[Stripe webhook] subscription period renewed', {
    stripeSubscriptionId,
    userId: subscriptionRow.user_id,
  });
}

// ============================================
// invoice.payment_failed
// Handles failed subscription renewal payments
// ============================================
async function handleInvoicePaymentFailed(
  supabaseAdmin: SupabaseClient,
  invoice: Stripe.Invoice
) {
  const stripeSubscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  if (!stripeSubscriptionId) {
    console.warn('[Stripe webhook] invoice.payment_failed without subscription id');
    return;
  }

  // For first-time payments, try to mark the session as failed
  if (invoice.billing_reason === 'subscription_create') {
    const metadata = invoice.subscription_details?.metadata ?? invoice.metadata ?? {};
    const idempotencyKey = metadata.idempotency_key ?? null;

    let session: SessionLookupRow | null = null;
    if (idempotencyKey) {
      session = await resolveSessionByIdempotencyKey(supabaseAdmin, idempotencyKey);
    }
    if (!session && metadata.user_id) {
      session = await resolveLatestPendingSessionForUser(
        supabaseAdmin,
        metadata.user_id,
        STRIPE_CONFIG.plans.pro.id,
        120
      );
    }

    if (session) {
      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from('subscription_sessions')
        .update({
          status: 'failed',
          failure_code: 'payment_failed',
          failure_message: 'Invoice payment failed',
          last_event_type: 'invoice.payment_failed',
          processing_started_at: null,
          updated_at: nowIso,
        })
        .eq('id', session.id)
        .is('used_at', null)
        .neq('status', 'succeeded')
        .neq('status', 'cancelled');
    }
    return;
  }

  // For renewal failures, mark subscription as past_due
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: nowIso,
    })
    .eq('stripe_subscription_id', stripeSubscriptionId);

  if (error) throw error;

  console.log('[Stripe webhook] subscription marked past_due', { stripeSubscriptionId });
}

// ============================================
// customer.subscription.updated
// Handles changes like cancel_at_period_end
// ============================================
async function handleSubscriptionUpdated(
  supabaseAdmin: SupabaseClient,
  subscription: Stripe.Subscription
) {
  const stripeSubscriptionId = subscription.id;

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!subscriptionRow) return;

  const nowIso = new Date().toISOString();
  const firstItem = subscription.items?.data?.[0];
  const periodEndTs = firstItem?.current_period_end;
  const periodEndIso = typeof periodEndTs === 'number' && periodEndTs > 0
    ? new Date(periodEndTs * 1000).toISOString()
    : null;

  if (subscription.cancel_at_period_end) {
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        cancel_requested_at: nowIso,
        ...(periodEndIso && { current_period_end: periodEndIso }),
        updated_at: nowIso,
      })
      .eq('stripe_subscription_id', stripeSubscriptionId);
    if (error) throw error;
  } else if (subscription.status === 'active') {
    const periodStartTs = firstItem?.current_period_start;
    const periodStartIso = typeof periodStartTs === 'number' && periodStartTs > 0
      ? new Date(periodStartTs * 1000).toISOString()
      : nowIso;
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'active',
        cancel_at_period_end: false,
        cancel_requested_at: null,
        current_period_start: periodStartIso,
        current_period_end: periodEndIso,
        updated_at: nowIso,
      })
      .eq('stripe_subscription_id', stripeSubscriptionId);
    if (error) throw error;
  }
}

// ============================================
// customer.subscription.deleted
// Final subscription cancellation
// ============================================
async function handleSubscriptionDeleted(
  supabaseAdmin: SupabaseClient,
  subscription: Stripe.Subscription
) {
  const stripeSubscriptionId = subscription.id;

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (!subscriptionRow) {
    console.log('[Stripe webhook] subscription.deleted ignored: unknown subscription', stripeSubscriptionId);
    return;
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
    .eq('stripe_subscription_id', stripeSubscriptionId);

  if (error) throw error;

  console.log('[Stripe webhook] subscription cancelled', {
    stripeSubscriptionId,
    userId: subscriptionRow.user_id,
  });
}

// ============================================
// charge.refunded
// Handles refund → cancellation
// ============================================
async function handleChargeRefunded(
  supabaseAdmin: SupabaseClient,
  charge: Stripe.Charge
) {
  const customerId =
    typeof charge.customer === 'string'
      ? charge.customer
      : charge.customer?.id ?? null;

  if (!customerId) {
    console.warn('[Stripe webhook] charge.refunded without customer id');
    return;
  }

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!subscriptionRow) {
    console.warn('[Stripe webhook] charge.refunded for unknown customer', customerId);
    return;
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
    .eq('user_id', subscriptionRow.user_id);

  if (error) throw error;

  console.log('[Stripe webhook] subscription cancelled due to refund', {
    userId: subscriptionRow.user_id,
    customerId,
  });
}

// ============================================
// Session resolution helpers
// ============================================
async function resolveSessionByIdempotencyKey(
  supabaseAdmin: SupabaseClient,
  idempotencyKey: string
): Promise<SessionLookupRow | null> {
  const { data, error } = await supabaseAdmin
    .from('subscription_sessions')
    .select('id, user_id, plan_id, created_at, used_at')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) throw error;
  return (data as SessionLookupRow | null) ?? null;
}

async function resolveLatestPendingSessionForUser(
  supabaseAdmin: SupabaseClient,
  userId: string | null,
  planId: string,
  maxAgeMinutes: number
): Promise<SessionLookupRow | null> {
  if (!userId) return null;
  const threshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('subscription_sessions')
    .select('id, user_id, plan_id, created_at, used_at')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
    .is('used_at', null)
    .gte('created_at', threshold)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SessionLookupRow | null) ?? null;
}
