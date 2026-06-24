import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { readSingleLineEnv } from '@/lib/env';
import { constructWebhookEvent } from '@/lib/stripe';
import { handleStripeWebhookEvent } from '@/lib/subscription/stripe-webhook-handlers';
import {
  claimWebhookEvent,
  hashPayload,
  markWebhookEventFailed,
  markWebhookEventProcessed,
} from '@/lib/webhooks/event-log';

class WebhookError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function getSupabaseAdmin(): SupabaseClient {
  const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');

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
      await handleStripeWebhookEvent(supabaseAdmin, event, {
        createWebhookError: (message, status) => new WebhookError(message, status),
      });

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
