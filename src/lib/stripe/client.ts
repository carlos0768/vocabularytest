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
