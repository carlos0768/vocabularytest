import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  activateBillingFromSession,
  type ActivateBillingParams,
  type ActivateBillingResult,
} from '@/lib/subscription/billing-activation';
import { STRIPE_CONFIG } from '@/lib/stripe/config';
import {
  handleCoinPackCheckoutCompleted,
  isCoinPackCheckoutSession,
} from '@/lib/coins/stripe-webhook';

type SessionLookupRow = {
  id: string;
  user_id: string;
  plan_id: string;
  created_at: string;
  used_at: string | null;
};

export type StripeWebhookHandlerDeps = {
  activateBillingFromSessionFn?: (
    supabaseAdmin: SupabaseClient,
    params: ActivateBillingParams,
    stripeSubscription?: Stripe.Subscription | null
  ) => Promise<ActivateBillingResult>;
  createWebhookError?: (message: string, status?: number) => Error;
  now?: () => Date;
};

function getNowIso(deps?: StripeWebhookHandlerDeps): string {
  return (deps?.now ?? (() => new Date()))().toISOString();
}

function createWebhookError(
  deps: StripeWebhookHandlerDeps | undefined,
  message: string,
  status = 400
): Error {
  return deps?.createWebhookError?.(message, status) ?? new Error(message);
}

/** Stripe SDK v22: subscription id lives under parent.subscription_details, not invoice.subscription */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const ref = invoice.parent?.subscription_details?.subscription;
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

function getInvoiceSubscriptionMetadata(invoice: Stripe.Invoice): Stripe.Metadata {
  const nested = invoice.parent?.subscription_details?.metadata;
  if (nested && Object.keys(nested).length > 0) return nested;
  return invoice.metadata ?? {};
}

export async function handleStripeWebhookEvent(
  supabaseAdmin: SupabaseClient,
  event: Stripe.Event,
  deps?: StripeWebhookHandlerDeps
) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(
        supabaseAdmin,
        event.data.object as Stripe.Checkout.Session,
        deps
      );
      break;

    case 'invoice.paid':
      await handleInvoicePaid(
        supabaseAdmin,
        event.data.object as Stripe.Invoice,
        deps
      );
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(
        supabaseAdmin,
        event.data.object as Stripe.Invoice,
        deps
      );
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(
        supabaseAdmin,
        event.data.object as Stripe.Subscription,
        deps
      );
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(
        supabaseAdmin,
        event.data.object as Stripe.Subscription,
        deps
      );
      break;

    case 'charge.refunded':
      await handleChargeRefunded(
        supabaseAdmin,
        event.data.object as Stripe.Charge,
        deps
      );
      break;

    default:
      console.log('Unhandled event type:', event.type);
  }
}

// ============================================
// checkout.session.completed
// Initial subscription activation from Checkout
// ============================================
export async function handleCheckoutSessionCompleted(
  supabaseAdmin: SupabaseClient,
  session: Stripe.Checkout.Session,
  deps?: StripeWebhookHandlerDeps
) {
  // コインパック（mode: 'payment'）はサブスク有効化パスに入れない
  if (isCoinPackCheckoutSession(session)) {
    await handleCoinPackCheckoutCompleted(supabaseAdmin, session);
    return;
  }

  if (session.mode !== 'subscription') {
    return;
  }

  const userId = session.metadata?.user_id;
  if (!userId) {
    throw createWebhookError(deps, 'No user_id in session metadata', 400);
  }

  const planId = session.metadata?.plan_id;
  if (planId !== STRIPE_CONFIG.plans.pro.id) {
    throw createWebhookError(deps, 'Plan id mismatch', 400);
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

  await (deps?.activateBillingFromSessionFn ?? activateBillingFromSession)(supabaseAdmin, {
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
export async function handleInvoicePaid(
  supabaseAdmin: SupabaseClient,
  invoice: Stripe.Invoice,
  deps?: StripeWebhookHandlerDeps
) {
  // Skip the first invoice; handled by checkout.session.completed.
  if (invoice.billing_reason === 'subscription_create') {
    return;
  }

  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);

  if (!stripeSubscriptionId) {
    throw createWebhookError(deps, 'Missing subscription id in invoice', 400);
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
  const nowIso = getNowIso(deps);

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
    userId: (subscriptionRow as { user_id: string }).user_id,
  });
}

// ============================================
// invoice.payment_failed
// Handles failed subscription renewal payments
// ============================================
export async function handleInvoicePaymentFailed(
  supabaseAdmin: SupabaseClient,
  invoice: Stripe.Invoice,
  deps?: StripeWebhookHandlerDeps
) {
  const stripeSubscriptionId = getInvoiceSubscriptionId(invoice);

  if (!stripeSubscriptionId) {
    console.warn('[Stripe webhook] invoice.payment_failed without subscription id');
    return;
  }

  // For first-time payments, try to mark the session as failed.
  if (invoice.billing_reason === 'subscription_create') {
    const metadata = getInvoiceSubscriptionMetadata(invoice);
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
      const nowIso = getNowIso(deps);
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

  // For renewal failures, mark subscription as past_due.
  const nowIso = getNowIso(deps);
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
export async function handleSubscriptionUpdated(
  supabaseAdmin: SupabaseClient,
  subscription: Stripe.Subscription,
  deps?: StripeWebhookHandlerDeps
) {
  const stripeSubscriptionId = subscription.id;

  const { data: subscriptionRow, error: fetchError } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!subscriptionRow) return;

  const nowIso = getNowIso(deps);
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
export async function handleSubscriptionDeleted(
  supabaseAdmin: SupabaseClient,
  subscription: Stripe.Subscription,
  deps?: StripeWebhookHandlerDeps
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

  const nowIso = getNowIso(deps);
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
    userId: (subscriptionRow as { user_id: string }).user_id,
  });
}

// ============================================
// charge.refunded
// Handles refund -> cancellation
// ============================================
export async function handleChargeRefunded(
  supabaseAdmin: SupabaseClient,
  charge: Stripe.Charge,
  deps?: StripeWebhookHandlerDeps
) {
  // コインパックの返金でサブスク解約パスに入れてはいけない —
  // このガードがないと¥150のパック返金でProが解約される。
  // コインの回収はv1では手動運用（docs/runbooks.md 参照）。
  if (charge.metadata?.purpose === 'coin_pack') {
    console.warn(
      '[Stripe webhook] coin pack charge refunded — manual coin clawback may be needed',
      { chargeId: charge.id }
    );
    return;
  }

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

  const nowIso = getNowIso(deps);
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
    .eq('user_id', (subscriptionRow as { user_id: string }).user_id);

  if (error) throw error;

  console.log('[Stripe webhook] subscription cancelled due to refund', {
    userId: (subscriptionRow as { user_id: string }).user_id,
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
