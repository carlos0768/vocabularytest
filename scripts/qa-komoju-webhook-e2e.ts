import { createHmac, randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { POST as webhookPost } from '@/app/api/subscription/webhook/route';
import { createSubscriptionSession } from '@/lib/komoju/client';
import { KOMOJU_CONFIG } from '@/lib/komoju/config';

type JsonRecord = Record<string, unknown>;

const SUCCESS_CARD = {
  number: '4111111111111111',
  month: '12',
  year: '30',
  verification_value: '123',
  name: 'QA TEST',
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const supabase = createClient(
  requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY')
);

const komojuSecretKey = requireEnv('KOMOJU_SECRET_KEY');
const webhookSecret = requireEnv('KOMOJU_WEBHOOK_SECRET');

function signPayload(payload: string): string {
  return createHmac('sha256', webhookSecret).update(payload).digest('hex');
}

async function sendWebhookEvent(event: JsonRecord) {
  const payload = JSON.stringify(event);
  const request = new NextRequest('http://localhost/api/subscription/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-komoju-signature': signPayload(payload),
    },
    body: payload,
  });
  const response = await webhookPost(request);
  const body = await response.text();
  return { status: response.status, body };
}

async function createQaUser(tag: string) {
  const email = `qa-komoju-${tag}-${Date.now()}@example.com`;
  const password = 'QaTest!123456';
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'komoju-webhook-e2e', tag },
  });
  if (error || !data.user?.id) {
    throw new Error(`Failed to create QA user (${tag}): ${error?.message ?? 'unknown error'}`);
  }
  return { userId: data.user.id, email };
}

async function createKomojuCustomer(email: string) {
  const authHeader = `Basic ${Buffer.from(`${komojuSecretKey}:`).toString('base64')}`;
  const response = await fetch('https://komoju.com/api/v1/customers', {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email,
      payment_details: {
        type: 'credit_card',
        ...SUCCESS_CARD,
      },
      metadata: {
        purpose: 'komoju_webhook_e2e',
      },
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.id) {
    throw new Error(`Failed to create KOMOJU customer: ${JSON.stringify(json)}`);
  }

  return json.id as string;
}

async function createSessionRecord(params: {
  userId: string;
  email: string;
  customerId?: string;
}) {
  const idempotencyKey = `qa-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = await createSubscriptionSession({
    planId: KOMOJU_CONFIG.plans.pro.id,
    customerEmail: params.email,
    customerId: params.customerId,
    returnUrl: 'https://example.com/subscription/success?session_id={SESSION_ID}',
    cancelUrl: 'https://example.com/subscription/cancel',
    idempotencyKey,
    metadata: {
      user_id: params.userId,
      plan: 'pro',
      plan_id: KOMOJU_CONFIG.plans.pro.id,
      idempotency_key: idempotencyKey,
      ...(params.customerId ? { customer_id: params.customerId } : {}),
    },
  });

  const { error: insertError } = await supabase.from('subscription_sessions').insert({
    id: session.id,
    user_id: params.userId,
    plan_id: KOMOJU_CONFIG.plans.pro.id,
    komoju_customer_id: params.customerId ?? null,
    idempotency_key: idempotencyKey,
    status: 'pending',
  });

  if (insertError && insertError.code !== '23505') {
    throw insertError;
  }

  return {
    sessionId: session.id,
    idempotencyKey,
  };
}

async function fetchSessionRow(sessionId: string) {
  const { data, error } = await supabase
    .from('subscription_sessions')
    .select(
      'id,status,used_at,komoju_customer_id,komoju_subscription_id,failure_code,failure_message,last_event_type'
    )
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchSubscriptionRow(userId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'user_id,status,plan,pro_source,komoju_customer_id,komoju_subscription_id,current_period_end,updated_at'
    )
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchWebhookRow(eventId: string) {
  const { data, error } = await supabase
    .from('webhook_events')
    .select('id,type,status,attempt_count,last_error,updated_at')
    .eq('id', eventId)
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  const successUser = await createQaUser('success');
  const failureUser = await createQaUser('failure');

  const customerId = await createKomojuCustomer(successUser.email);

  const successSession = await createSessionRecord({
    userId: successUser.userId,
    email: successUser.email,
    customerId,
  });

  const successEventId = `evt_qa_success_${Date.now()}`;
  const successEvent = {
    id: successEventId,
    type: 'payment.captured',
    data: {
      id: `pay_qa_success_${randomUUID().slice(0, 8)}`,
      amount: KOMOJU_CONFIG.plans.pro.price,
      currency: KOMOJU_CONFIG.plans.pro.currency,
      session: { id: successSession.sessionId },
      customer: { id: customerId },
      metadata: {
        user_id: successUser.userId,
        plan: 'pro',
        plan_id: KOMOJU_CONFIG.plans.pro.id,
        customer_id: customerId,
        idempotency_key: successSession.idempotencyKey,
      },
    },
  };

  const successWebhookResult = await sendWebhookEvent(successEvent);
  const successSessionRow = await fetchSessionRow(successSession.sessionId);
  const successSubscriptionRow = await fetchSubscriptionRow(successUser.userId);
  const successWebhookRow = await fetchWebhookRow(`event:${successEventId}`);

  const duplicateWebhookResult = await sendWebhookEvent(successEvent);
  const duplicateWebhookRow = await fetchWebhookRow(`event:${successEventId}`);

  const failureSession = await createSessionRecord({
    userId: failureUser.userId,
    email: failureUser.email,
  });

  const failureEventId = `evt_qa_failure_${Date.now()}`;
  const failureEvent = {
    id: failureEventId,
    type: 'payment.failed',
    data: {
      id: `pay_qa_failure_${randomUUID().slice(0, 8)}`,
      amount: KOMOJU_CONFIG.plans.pro.price,
      currency: KOMOJU_CONFIG.plans.pro.currency,
      session: { id: failureSession.sessionId },
      failure_code: 'insufficient_funds',
      failure_message: 'Insufficient funds',
      metadata: {
        user_id: failureUser.userId,
        plan: 'pro',
        plan_id: KOMOJU_CONFIG.plans.pro.id,
        idempotency_key: failureSession.idempotencyKey,
      },
    },
  };

  const failureWebhookResult = await sendWebhookEvent(failureEvent);
  const failureSessionRow = await fetchSessionRow(failureSession.sessionId);
  const failureSubscriptionRow = await fetchSubscriptionRow(failureUser.userId);
  const failureWebhookRow = await fetchWebhookRow(`event:${failureEventId}`);

  const summary = {
    users: {
      success: successUser,
      failure: failureUser,
    },
    successCase: {
      sessionId: successSession.sessionId,
      webhookResponse: successWebhookResult,
      sessionRow: successSessionRow,
      subscriptionRow: successSubscriptionRow,
      webhookRow: successWebhookRow,
      duplicateWebhookResponse: duplicateWebhookResult,
      duplicateWebhookRow,
    },
    failureCase: {
      sessionId: failureSession.sessionId,
      webhookResponse: failureWebhookResult,
      sessionRow: failureSessionRow,
      subscriptionRow: failureSubscriptionRow,
      webhookRow: failureWebhookRow,
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    '[qa-komoju-webhook-e2e] failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
