import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { verifyWebhookSignature } from '@/lib/komoju';

// Lazy initialization of Supabase admin client
function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient(url, key);
}

// POST /api/subscription/webhook
// Handles KOMOJU webhook events
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-komoju-signature') || '';
    const webhookSecret = process.env.KOMOJU_WEBHOOK_SECRET;

    // Verify webhook signature
    if (webhookSecret && !verifyWebhookSignature(payload, signature, webhookSecret)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(payload);
    console.log('KOMOJU webhook event:', event.type);

    const supabaseAdmin = getSupabaseAdmin();

    // Handle different event types
    switch (event.type) {
      case 'subscription.created':
      case 'subscription.activated':
        await handleSubscriptionActivated(supabaseAdmin, event.data);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(supabaseAdmin, event.data);
        break;

      case 'subscription.payment_failed':
        await handlePaymentFailed(supabaseAdmin, event.data);
        break;

      case 'payment.captured':
        // Initial payment successful
        if (event.data.metadata?.plan === 'pro') {
          await handleSubscriptionActivated(supabaseAdmin, event.data);
        }
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionActivated(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;
  if (!userId) {
    console.error('No user_id in subscription metadata');
    return;
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      plan: 'pro',
      komoju_subscription_id: data.id,
      komoju_customer_id: data.customer?.id,
      current_period_start: data.current_period_start || new Date().toISOString(),
      current_period_end: data.current_period_end || null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Subscription activated for user: ${userId}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSubscriptionCancelled(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;
  if (!userId) {
    console.error('No user_id in subscription metadata');
    return;
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Subscription cancelled for user: ${userId}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentFailed(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;
  if (!userId) {
    console.error('No user_id in subscription metadata');
    return;
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Payment failed for user: ${userId}`);
}
