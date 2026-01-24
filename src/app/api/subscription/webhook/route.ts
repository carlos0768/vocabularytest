import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { verifyWebhookSignature, createSubscription } from '@/lib/komoju';

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
      // Customer created via hosted page - create subscription
      case 'customer.created':
        await handleCustomerCreated(supabaseAdmin, event.data);
        break;

      // Session completed (customer mode) - create subscription
      case 'session.completed':
        if (event.data.mode === 'customer' && event.data.customer_id) {
          await handleCustomerSessionCompleted(supabaseAdmin, event.data);
        }
        break;

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
async function handleCustomerCreated(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;
  const customerId = data.id;

  if (!userId || !customerId) {
    console.error('Missing user_id or customer_id in customer.created event');
    return;
  }

  try {
    // Create subscription using the new customer
    const subscription = await createSubscription(customerId, {
      user_id: userId,
      plan: 'pro',
    });

    console.log(`Subscription created for user ${userId}: ${subscription.id}`);

    // Update user's subscription record
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: subscription.status === 'active' ? 'active' : 'pending',
        plan: 'pro',
        komoju_subscription_id: subscription.id,
        komoju_customer_id: customerId,
        current_period_end: subscription.current_period_end || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update subscription:', error);
      throw error;
    }
  } catch (err) {
    console.error('Failed to create subscription:', err);
    throw err;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCustomerSessionCompleted(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;
  const customerId = data.customer_id;

  if (!userId || !customerId) {
    console.error('Missing user_id or customer_id in session.completed event');
    return;
  }

  try {
    // Create subscription using the customer from session
    const subscription = await createSubscription(customerId, {
      user_id: userId,
      plan: 'pro',
    });

    console.log(`Subscription created for user ${userId}: ${subscription.id}`);

    // Update user's subscription record
    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: subscription.status === 'active' ? 'active' : 'pending',
        plan: 'pro',
        komoju_subscription_id: subscription.id,
        komoju_customer_id: customerId,
        current_period_end: subscription.current_period_end || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to update subscription:', error);
      throw error;
    }
  } catch (err) {
    console.error('Failed to create subscription:', err);
    throw err;
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
