import { SupabaseClient } from '@supabase/supabase-js';
import { createSubscription, getSession, KOMOJU_CONFIG, type KomojuSession } from '@/lib/komoju';

type ActivationContext = 'webhook' | 'reconcile';

export const BILLING_ACTIVATION_ERRORS = {
  ACTIVATION_IN_PROGRESS: 'Activation in progress',
  MISSING_CUSTOMER_ID: 'Missing customer id from KOMOJU session',
  SESSION_CANCELLED: 'Session cancelled',
} as const;

export type ActivateBillingParams = {
  sessionId: string;
  userId: string;
  customerIdFromEvent?: string | null;
  customerIdFromMetadata?: string | null;
  subscriptionIdFromEvent?: string | null;
  eventType?: string | null;
  context: ActivationContext;
};

export type ActivateBillingResult = {
  activated: boolean;
  alreadyProcessed: boolean;
  userId: string;
  sessionId: string;
  komojuCustomerId: string;
  komojuSubscriptionId: string;
  skippedReason?: 'already_succeeded' | 'in_progress';
};

type SessionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  used_at: string | null;
  komoju_customer_id: string | null;
  komoju_subscription_id: string | null;
  status: string;
};

type SessionClaimRow = {
  id: string;
  status: string;
  used_at: string | null;
  komoju_customer_id: string | null;
  komoju_subscription_id: string | null;
  should_process: boolean;
  claim_reason: string;
};

type SubscriptionRow = {
  komoju_subscription_id: string | null;
  komoju_customer_id: string | null;
};

function addOneMonth(base: Date): Date {
  const periodEnd = new Date(base);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  return periodEnd;
}

function ensurePlanId(planId: string) {
  if (planId !== KOMOJU_CONFIG.plans.pro.id) {
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
    .select('id, user_id, plan_id, used_at, komoju_customer_id, komoju_subscription_id, status')
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
    .select('komoju_subscription_id, komoju_customer_id')
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

export function extractCustomerIdFromSessionPayload(session: KomojuSession): string | null {
  if (typeof session.customer_id === 'string' && session.customer_id) {
    return session.customer_id;
  }

  if (typeof session.customer === 'string' && session.customer) {
    return session.customer;
  }

  if (session.customer && typeof session.customer === 'object') {
    const customerObjectId = typeof session.customer.id === 'string' ? session.customer.id : null;
    if (customerObjectId) {
      return customerObjectId;
    }
  }

  if (typeof session.payment?.customer === 'string' && session.payment.customer) {
    return session.payment.customer;
  }

  if (typeof session.payment?.customer_id === 'string' && session.payment.customer_id) {
    return session.payment.customer_id;
  }

  const metadataCustomerId = session.metadata?.customer_id;
  if (typeof metadataCustomerId === 'string' && metadataCustomerId) {
    return metadataCustomerId;
  }

  const paymentMetadataCustomerId = session.payment?.metadata?.customer_id;
  if (typeof paymentMetadataCustomerId === 'string' && paymentMetadataCustomerId) {
    return paymentMetadataCustomerId;
  }

  return null;
}

async function ensureCustomerId(
  sessionId: string,
  candidateCustomerId: string | null
): Promise<string> {
  if (candidateCustomerId) {
    return candidateCustomerId;
  }

  try {
    const session = await getSession(sessionId);
    const customerId = extractCustomerIdFromSessionPayload(session);
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
  customerId: string,
  subscriptionIdFromEvent: string | null,
  sessionSubscriptionId: string | null
): Promise<string> {
  const existingSubscription = await getExistingSubscriptionRow(supabaseAdmin, userId);
  const existingSubscriptionId = existingSubscription?.komoju_subscription_id ?? null;

  const resolvedSubscriptionId = resolveSubscriptionIdCandidate(
    subscriptionIdFromEvent,
    sessionSubscriptionId,
    existingSubscriptionId
  );
  if (resolvedSubscriptionId) {
    return resolvedSubscriptionId;
  }

  try {
    const createdSubscription = await createSubscription(customerId, {
      user_id: userId,
      plan: 'pro',
      plan_id: KOMOJU_CONFIG.plans.pro.id,
      session_id: sessionId,
    });
    return createdSubscription.id;
  } catch (error) {
    // If another processor created it concurrently, read back once before failing.
    const postCreateRow = await getExistingSubscriptionRow(supabaseAdmin, userId);
    if (postCreateRow?.komoju_subscription_id) {
      return postCreateRow.komoju_subscription_id;
    }
    throw error;
  }
}

export async function activateBillingFromSession(
  supabaseAdmin: SupabaseClient,
  params: ActivateBillingParams
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
      claim.komoju_customer_id,
      existingSubscription?.komoju_customer_id,
      params.customerIdFromEvent,
      params.customerIdFromMetadata
    );
    const existingSubscriptionId = pickFirstString(
      claim.komoju_subscription_id,
      existingSubscription?.komoju_subscription_id,
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
      komojuCustomerId: existingCustomerId,
      komojuSubscriptionId: existingSubscriptionId,
    };
  }

  const customerId = await ensureCustomerId(
    params.sessionId,
    pickFirstString(
      params.customerIdFromEvent,
      session.komoju_customer_id,
      params.customerIdFromMetadata
    )
  );

  const komojuSubscriptionId = await ensureBillingSubscriptionId(
    supabaseAdmin,
    params.userId,
    params.sessionId,
    customerId,
    params.subscriptionIdFromEvent ?? null,
    session.komoju_subscription_id
  );

  const now = new Date();
  const nowIso = now.toISOString();
  const periodStartIso = nowIso;
  const periodEndIso = addOneMonth(now).toISOString();

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
    .eq('user_id', params.userId);

  if (updateError) {
    throw updateError;
  }

  const { error: sessionUpdateError } = await supabaseAdmin
    .from('subscription_sessions')
    .update({
      komoju_customer_id: customerId,
      komoju_subscription_id: komojuSubscriptionId,
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
    komojuCustomerId: customerId,
    komojuSubscriptionId,
  };
}
