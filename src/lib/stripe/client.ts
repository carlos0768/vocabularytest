// Stripe API Client
// Server-side only — uses STRIPE_SECRET_KEY

import Stripe from 'stripe';
import { STRIPE_CONFIG } from './config';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, { apiVersion: '2025-04-30.basil' });
  }
  return _stripe;
}

// ============================================
// Checkout Session API
// ============================================

export interface CreateCheckoutSessionParams {
  customerEmail: string;
  customerId?: string;
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const plan = STRIPE_CONFIG.plans.pro;

  return stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      ...(params.customerId
        ? { customer: params.customerId }
        : { customer_email: params.customerEmail }),
      success_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      locale: 'ja',
      metadata: params.metadata,
    },
    params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : undefined
  );
}

export interface CreateOneTimeCheckoutSessionParams {
  priceId: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

// 単発決済用（コインパック等）。サブスク用の createCheckoutSession とは分離。
// metadata は Checkout Session と PaymentIntent の両方に付与する —
// charge.refunded Webhook が charge.metadata で purpose を判別できるようにするため。
export async function createOneTimeCheckoutSession(
  params: CreateOneTimeCheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: params.priceId, quantity: 1 }],
    ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    locale: 'ja',
    metadata: params.metadata,
    payment_intent_data: {
      metadata: params.metadata,
    },
  });
}

export async function getCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
}

// ============================================
// Subscription API
// ============================================

export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function cancelSubscriptionImmediately(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.cancel(subscriptionId);
}

// ============================================
// Customer API
// ============================================

export async function createCustomer(
  email: string,
  metadata?: Record<string, string>
): Promise<Stripe.Customer> {
  const stripe = getStripe();
  return stripe.customers.create({ email, metadata });
}

export async function getCustomer(
  customerId: string
): Promise<Stripe.Customer> {
  const stripe = getStripe();
  return stripe.customers.retrieve(customerId) as Promise<Stripe.Customer>;
}

// ============================================
// Finance Reporting API (/ops/finance)
// ============================================

// 支払済み請求書(=サブスク売上実績)を作成日時の下限指定で取得する。
// コインパック等の単発決済は invoice を作らないため含まれない。
// ページ上限で取得量を抑える(100件×20ページ)。
const FINANCE_LIST_PAGE_LIMIT = 20;

export async function listPaidInvoicesSince(
  createdGteUnixSeconds: number
): Promise<Stripe.Invoice[]> {
  const stripe = getStripe();
  const invoices: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < FINANCE_LIST_PAGE_LIMIT; page++) {
    const result = await stripe.invoices.list({
      status: 'paid',
      created: { gte: createdGteUnixSeconds },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    invoices.push(...result.data);
    const last = result.data[result.data.length - 1];
    if (!result.has_more || !last?.id) break;
    startingAfter = last.id;
  }

  return invoices;
}

export async function listSucceededRefundsSince(
  createdGteUnixSeconds: number
): Promise<Stripe.Refund[]> {
  const stripe = getStripe();
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < FINANCE_LIST_PAGE_LIMIT; page++) {
    const result = await stripe.refunds.list({
      created: { gte: createdGteUnixSeconds },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    refunds.push(...result.data.filter((refund) => refund.status === 'succeeded'));
    const last = result.data[result.data.length - 1];
    if (!result.has_more || !last?.id) break;
    startingAfter = last.id;
  }

  return refunds;
}

// ============================================
// Webhook Verification
// ============================================

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
