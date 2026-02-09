import { SupabaseClient } from '@supabase/supabase-js';
import { createSubscription, getSession, KOMOJU_CONFIG, type KomojuSession } from '@/lib/komoju';

type ActivationContext = 'webhook' | 'reconcile';

export type ActivateBillingParams = {
  sessionId: string;
  userId: string;
  customerIdFromEvent?: string | null;
  customerIdFromMetadata?: string | null;
  context: ActivationContext;
};

export type ActivateBillingResult = {
  activated: boolean;
  alreadyProcessed: boolean;
  userId: string;
  sessionId: string;
  komojuCustomerId: string;
  komojuSubscriptionId: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  plan_id: string;
  used_at: string | null;
  komoju_customer_id: string | null;
  komoju_subscription_id: string | null;
};

type SubscriptionRow = {
  komoju_subscription_id: string | null;
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

async function getSessionRow(
  supabaseAdmin: SupabaseClient,
  sessionId: string
): Promise<SessionRow> {
  const { data, error } = await supabaseAdmin
    .from('subscription_sessions')
    .select('id, user_id, plan_id, used_at, komoju_customer_id, komoju_subscription_id')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    throw new Error('Unknown session id');
  }

  return data as SessionRow;
}

function getCustomerIdFromSessionPayload(session: KomojuSession): string | null {
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
    const customerId = getCustomerIdFromSessionPayload(session);
    if (customerId) {
      return customerId;
    }
  } catch (error) {
    console.error('[BillingActivation] failed to fetch session for customer recovery', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  throw new Error('Missing customer id from KOMOJU session');
}

async function ensureBillingSubscriptionId(
  supabaseAdmin: SupabaseClient,
  userId: string,
  sessionId: string,
  customerId: string,
  sessionSubscriptionId: string | null
): Promise<string> {
  if (sessionSubscriptionId) {
    return sessionSubscriptionId;
  }

  const { data: existingSubscription, error: existingSubscriptionError } = await supabaseAdmin
    .from('subscriptions')
    .select('komoju_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingSubscriptionError) {
    throw existingSubscriptionError;
  }

  const subscriptionRow = existingSubscription as SubscriptionRow | null;
  if (subscriptionRow?.komoju_subscription_id) {
    return subscriptionRow.komoju_subscription_id;
  }

  const createdSubscription = await createSubscription(customerId, {
    user_id: userId,
    plan: 'pro',
    plan_id: KOMOJU_CONFIG.plans.pro.id,
    session_id: sessionId,
  });

  return createdSubscription.id;
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

  const customerId = await ensureCustomerId(
    params.sessionId,
    params.customerIdFromEvent ?? session.komoju_customer_id ?? params.customerIdFromMetadata ?? null
  );

  const komojuSubscriptionId = await ensureBillingSubscriptionId(
    supabaseAdmin,
    params.userId,
    params.sessionId,
    customerId,
    session.komoju_subscription_id
  );

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
    .eq('id', params.sessionId);

  if (sessionMetaError) {
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
    .eq('user_id', params.userId);

  if (updateError) {
    throw updateError;
  }

  if (!session.used_at) {
    const { error: markError } = await supabaseAdmin
      .from('subscription_sessions')
      .update({ used_at: nowIso })
      .eq('id', params.sessionId);

    if (markError) {
      throw markError;
    }
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
