import { SupabaseClient } from '@supabase/supabase-js';
import { getCheckoutSession, STRIPE_CONFIG } from '@/lib/stripe';
import type Stripe from 'stripe';

type ActivationContext = 'webhook' | 'reconcile';

export const BILLING_ACTIVATION_ERRORS = {
  ACTIVATION_IN_PROGRESS: 'Activation in progress',
  MISSING_CUSTOMER_ID: 'Missing customer id from Stripe session',
  SESSION_CANCELLED: 'Session cancelled',
} as const;

export type ActivateBillingParams = {
  sessionId: string;
  userId: string;
  customerIdFromEvent?: string | null;
  subscriptionIdFromEvent?: string | null;
  eventType?: string | null;
  context: ActivationContext;
};

export type ActivateBillingResult = {
  activated: boolean;
  alreadyProcessed: boolean;
  userId: string;
  sessionId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  skippedReason?: 'already_succeeded' | 'in_progress';
};

type SessionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  used_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
};

type SessionClaimRow = {
  id: string;
  status: string;
  used_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  should_process: boolean;
  claim_reason: string;
};

type SubscriptionRow = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
};

function ensurePlanId(planId: string) {
  if (planId !== STRIPE_CONFIG.plans.pro.id) {
    throw new Error('Session plan mismatch');
  }
}

function pickFirstString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return null;
}

function normalizeClaimReason(
  value: string
): 'claim_granted' | 'already_succeeded' | 'cancelled' | 'in_progress' {
  if (
    value === 'claim_granted' ||
    value === 'already_succeeded' ||
    value === 'cancelled' ||
    value === 'in_progress'
  ) {
    return value;
  }
  return 'in_progress';
}

async function getSessionRow(
  supabaseAdmin: SupabaseClient,
  sessionId: string
): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin
    .from('subscription_sessions')
    .select('id, user_id, plan_id, used_at, stripe_customer_id, stripe_subscription_id, status')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    throw new Error('Unknown session id');
  }

  return data as SessionRow;
}

async function claimSessionForActivation(
  supabaseAdmin: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<SessionClaimRow> {
  const { data, error } = await supabaseAdmin.rpc('claim_subscription_session', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_stale_after_seconds: 300,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Failed to claim subscription session');
  }

  return row as SessionClaimRow;
}

async function getExistingSubscriptionRow(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as SubscriptionRow | null) ?? null;
}

export function resolveSubscriptionIdCandidate(
  subscriptionIdFromEvent: string | null | undefined,
  sessionSubscriptionId: string | null | undefined,
  existingSubscriptionId: string | null | undefined
): string | null {
  return pickFirstString(
    subscriptionIdFromEvent,
    sessionSubscriptionId,
    existingSubscriptionId
  );
}

export function extractIdsFromCheckoutSession(
  session: Stripe.Checkout.Session
): { customerId: string | null; subscriptionId: string | null } {
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null;

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;

  return { customerId, subscriptionId };
}

async function ensureCustomerId(
  sessionId: string,
  candidateCustomerId: string | null
): Promise<string> {
  if (candidateCustomerId) {
    return candidateCustomerId;
  }

  try {
    const checkoutSession = await getCheckoutSession(sessionId);
    const { customerId } = extractIdsFromCheckoutSession(checkoutSession);
    if (customerId) {
      return customerId;
    }
  } catch (error) {
    console.error('[BillingActivation] failed to fetch session for customer recovery', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  throw new Error(BILLING_ACTIVATION_ERRORS.MISSING_CUSTOMER_ID);
}

async function ensureBillingSubscriptionId(
  supabaseAdmin: SupabaseClient,
  userId: string,
  sessionId: string,
  subscriptionIdFromEvent: string | null,
  sessionSubscriptionId: string | null
): Promise<string> {
  const existingSubscription = await getExistingSubscriptionRow(supabaseAdmin, userId);
  const existingSubscriptionId = existingSubscription?.stripe_subscription_id ?? null;

  const resolvedSubscriptionId = resolveSubscriptionIdCandidate(
    subscriptionIdFromEvent,
    sessionSubscriptionId,
    existingSubscriptionId
  );
  if (resolvedSubscriptionId) {
    return resolvedSubscriptionId;
  }

  // Stripe Checkout in subscription mode auto-creates the subscription,
  // so we should always have an ID by now. Fetch from Stripe as fallback.
  try {
    const checkoutSession = await getCheckoutSession(sessionId);
    const { subscriptionId } = extractIdsFromCheckoutSession(checkoutSession);
    if (subscriptionId) {
      return subscriptionId;
    }
  } catch (error) {
    console.error('[BillingActivation] failed to fetch session for subscription recovery', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  throw new Error('Cannot resolve Stripe subscription ID');
}

function computePeriodDates(stripeSubscription: Stripe.Subscription | null): {
  periodStartIso: string;
  periodEndIso: string;
} {
  if (stripeSubscription) {
    const firstItem = stripeSubscription.items?.data?.[0];
    const startTs = firstItem?.current_period_start;
    const endTs = firstItem?.current_period_end;
    if (typeof startTs === 'number' && startTs > 0 && typeof endTs === 'number' && endTs > 0) {
      return {
        periodStartIso: new Date(startTs * 1000).toISOString(),
        periodEndIso: new Date(endTs * 1000).toISOString(),
      };
    }
  }
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return {
    periodStartIso: now.toISOString(),
    periodEndIso: periodEnd.toISOString(),
  };
}

export async function activateBillingFromSession(
  supabaseAdmin: SupabaseClient,
  params: ActivateBillingParams,
  stripeSubscription?: Stripe.Subscription | null
): Promise<ActivateBillingResult> {
  const session = await getSessionRow(supabaseAdmin, params.sessionId);
  if (session.user_id !== params.userId) {
    throw new Error('Session user mismatch');
  }
  ensurePlanId(session.plan_id);

  const claim = await claimSessionForActivation(supabaseAdmin, params.sessionId, params.userId);
  const claimReason = normalizeClaimReason(claim.claim_reason);
  if (!claim.should_process) {
    if (claimReason === 'cancelled') {
      throw new Error(BILLING_ACTIVATION_ERRORS.SESSION_CANCELLED);
    }

    const existingSubscription = await getExistingSubscriptionRow(supabaseAdmin, params.userId);
    const existingCustomerId = pickFirstString(
      claim.stripe_customer_id,
      existingSubscription?.stripe_customer_id,
      params.customerIdFromEvent
    );
    const existingSubscriptionId = pickFirstString(
      claim.stripe_subscription_id,
      existingSubscription?.stripe_subscription_id,
      params.subscriptionIdFromEvent
    );

    if (!existingCustomerId || !existingSubscriptionId) {
      throw new Error(BILLING_ACTIVATION_ERRORS.ACTIVATION_IN_PROGRESS);
    }

    return {
      activated: false,
      alreadyProcessed: true,
      skippedReason: claimReason === 'in_progress' ? 'in_progress' : 'already_succeeded',
      userId: params.userId,
      sessionId: params.sessionId,
      stripeCustomerId: existingCustomerId,
      stripeSubscriptionId: existingSubscriptionId,
    };
  }

  const customerId = await ensureCustomerId(
    params.sessionId,
    pickFirstString(
      params.customerIdFromEvent,
      session.stripe_customer_id
    )
  );

  const stripeSubscriptionId = await ensureBillingSubscriptionId(
    supabaseAdmin,
    params.userId,
    params.sessionId,
    params.subscriptionIdFromEvent ?? null,
    session.stripe_subscription_id
  );

  const { periodStartIso, periodEndIso } = computePeriodDates(stripeSubscription ?? null);
  const nowIso = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      plan: 'pro',
      pro_source: 'billing',
      test_pro_expires_at: null,
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSubscriptionId,
      current_period_start: periodStartIso,
      current_period_end: periodEndIso,
      cancel_at_period_end: false,
      cancel_requested_at: null,
      updated_at: nowIso,
    })
    .eq('user_id', params.userId);

  if (updateError) {
    throw updateError;
  }

  const { error: sessionUpdateError } = await supabaseAdmin
    .from('subscription_sessions')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSubscriptionId,
      used_at: session.used_at ?? nowIso,
      status: 'succeeded',
      failure_code: null,
      failure_message: null,
      last_event_type: params.eventType ?? session.status ?? null,
      processing_started_at: null,
      updated_at: nowIso,
    })
    .eq('id', params.sessionId);

  if (sessionUpdateError) {
    throw sessionUpdateError;
  }

  console.log('[BillingActivation] completed', {
    context: params.context,
    userId: params.userId,
    sessionId: params.sessionId,
    reusedSession: Boolean(session.used_at),
  });

  return {
    activated: true,
    alreadyProcessed: Boolean(session.used_at),
    userId: params.userId,
    sessionId: params.sessionId,
    stripeCustomerId: customerId,
    stripeSubscriptionId,
  };
}
