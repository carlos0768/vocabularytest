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

    // Verify webhook signature (skip if no secret configured for testing)
    if (webhookSecret && webhookSecret !== 'test' && signature) {
      if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
        console.error('Invalid webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const event = JSON.parse(payload);
    console.log('KOMOJU webhook event:', event.type, JSON.stringify(event.data, null, 2));

    const supabaseAdmin = getSupabaseAdmin();

    // Handle different event types
    switch (event.type) {
      // Payment captured - activate Pro plan
      case 'payment.captured':
        await handlePaymentCaptured(supabaseAdmin, event.data);
        break;

      // Payment refunded - deactivate Pro plan
      case 'payment.refunded':
        await handlePaymentRefunded(supabaseAdmin, event.data);
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
async function handlePaymentCaptured(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;

  if (!userId) {
    console.error('No user_id in payment metadata');
    return;
  }

  // Check if this is a Pro plan payment
  if (data.metadata?.plan !== 'pro') {
    console.log('Payment is not for Pro plan, skipping');
    return;
  }

  // Calculate subscription period (1 month from now)
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      plan: 'pro',
      komoju_customer_id: data.customer?.id || null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update subscription:', error);
    throw error;
  }

  console.log(`Pro plan activated for user: ${userId}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaymentRefunded(supabaseAdmin: SupabaseClient, data: any) {
  const userId = data.metadata?.user_id;

  if (!userId) {
    console.error('No user_id in payment metadata');
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

  console.log(`Subscription cancelled due to refund for user: ${userId}`);
}
