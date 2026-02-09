// KOMOJU API Client
// Server-side only - contains secret key

import { createHmac, timingSafeEqual } from 'crypto';
import { KOMOJU_CONFIG } from './config';

const KOMOJU_SECRET_KEY = process.env.KOMOJU_SECRET_KEY!;
const KOMOJU_API_URL = KOMOJU_CONFIG.apiUrl;

// Basic auth header
function getAuthHeader() {
  const encoded = Buffer.from(`${KOMOJU_SECRET_KEY}:`).toString('base64');
  return `Basic ${encoded}`;
}

type KomojuRequestOptions = RequestInit & {
  idempotencyKey?: string;
};

// API request helper
async function komojuRequest<T>(
  endpoint: string,
  options: KomojuRequestOptions = {}
): Promise<T> {
  const { idempotencyKey, headers: customHeaders, ...fetchOptions } = options;

  const response = await fetch(`${KOMOJU_API_URL}${endpoint}`, {
    ...fetchOptions,
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(idempotencyKey
        ? {
            'X-KOMOJU-IDEMPOTENCY': idempotencyKey,
            'Idempotency-Key': idempotencyKey,
          }
        : {}),
      ...customHeaders,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('KOMOJU API error details:', JSON.stringify(error, null, 2));
    throw new Error(error.message || error.error?.message || `KOMOJU API error: ${response.status}`);
  }

  return response.json();
}

// ============================================
// Session API (Hosted Page)
// ============================================

export interface CreateSessionParams {
  amount: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  paymentMethods?: string[];
  locale?: string;
}

export interface KomojuSession {
  id: string;
  resource: 'session';
  mode: 'payment' | 'subscription' | 'customer_payment';
  amount: number;
  currency: string;
  session_url: string;
  return_url: string;
  status: 'created' | 'completed' | 'expired';
  metadata?: Record<string, string | number | boolean | null>;
  customer?:
    | string
    | {
        id?: string;
      };
  payment?: {
    id: string;
    status: string;
    customer?: string;
    session_id?: string;
    metadata?: Record<string, string | number | boolean | null>;
  };
}

// Create a payment session for one-time payment
export async function createPaymentSession(
  params: CreateSessionParams
): Promise<KomojuSession> {
  return komojuRequest<KomojuSession>('/sessions', {
    method: 'POST',
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      default_locale: params.locale || 'ja',
      payment_types: params.paymentMethods || KOMOJU_CONFIG.paymentMethods,
      metadata: params.metadata,
    }),
  });
}

// ============================================
// Subscription API
// ============================================

export interface CreateSubscriptionParams {
  planId: string;
  customerEmail: string;
  customerId?: string;
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface KomojuSubscription {
  id: string;
  resource: 'subscription';
  status: 'active' | 'cancelled' | 'past_due' | 'pending' | 'retrying' | 'suspended';
  amount: number;
  currency: string;
  period: 'weekly' | 'monthly' | 'yearly';
  customer: string;
  current_period_end?: string;
  created_at: string;
  metadata?: Record<string, string>;
}

// Create a payment session that also creates a customer for future subscription billing
// Uses mode: 'customer_payment' to collect payment and save customer details
export async function createSubscriptionSession(
  params: CreateSubscriptionParams
): Promise<KomojuSession> {
  const plan = KOMOJU_CONFIG.plans.pro;

  return komojuRequest<KomojuSession>('/sessions', {
    method: 'POST',
    idempotencyKey: params.idempotencyKey,
    body: JSON.stringify({
      mode: 'customer_payment',
      amount: plan.price,
      currency: plan.currency,
      email: params.customerEmail,
      ...(params.customerId ? { customer_id: params.customerId } : {}),
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      default_locale: 'ja',
      payment_types: KOMOJU_CONFIG.paymentMethods,
      metadata: {
        ...params.metadata,
        plan_id: params.planId,
      },
    }),
  });
}

export async function getSession(sessionId: string): Promise<KomojuSession> {
  return komojuRequest<KomojuSession>(`/sessions/${sessionId}`);
}

// Create subscription with existing customer
export async function createSubscription(
  customerId: string,
  metadata?: Record<string, string>
): Promise<KomojuSubscription> {
  const plan = KOMOJU_CONFIG.plans.pro;

  return komojuRequest<KomojuSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      amount: plan.price,
      currency: plan.currency,
      period: plan.interval === 'month' ? 'monthly' : plan.interval,
      metadata,
    }),
  });
}

// Get subscription details
export async function getSubscription(
  subscriptionId: string
): Promise<KomojuSubscription> {
  return komojuRequest<KomojuSubscription>(`/subscriptions/${subscriptionId}`);
}

// Cancel subscription
export async function cancelSubscription(
  subscriptionId: string
): Promise<KomojuSubscription> {
  return komojuRequest<KomojuSubscription>(
    `/subscriptions/${subscriptionId}/cancel`,
    { method: 'POST' }
  );
}

// ============================================
// Customer API
// ============================================

export interface KomojuCustomer {
  id: string;
  resource: 'customer';
  email: string;
  created_at: string;
  metadata?: Record<string, string>;
}

// Create or get customer
export async function createCustomer(
  email: string,
  metadata?: Record<string, string>
): Promise<KomojuCustomer> {
  return komojuRequest<KomojuCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify({
      email,
      metadata,
    }),
  });
}

// ============================================
// Webhook Verification
// ============================================

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const normalized = signature.trim().replace(/^sha256=/, '');
  const expected = createHmac('sha256', secret).update(payload).digest();

  if (isHex(normalized)) {
    if (normalized.length !== expected.length * 2) {
      return false;
    }
    return timingSafeEqual(
      Buffer.from(normalized, 'hex'),
      expected
    );
  }

  if (isBase64(normalized)) {
    const decoded = Buffer.from(normalized, 'base64');
    if (decoded.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(decoded, expected);
  }

  return false;
}

function isHex(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value);
}

function isBase64(value: string): boolean {
  return /^[A-Za-z0-9+/=]+$/.test(value);
}
