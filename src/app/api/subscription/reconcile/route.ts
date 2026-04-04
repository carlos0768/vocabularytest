import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  activateBillingFromSession,
  BILLING_ACTIVATION_ERRORS,
  extractIdsFromCheckoutSession,
} from '@/lib/subscription/billing-activation';
import { getCheckoutSession, STRIPE_CONFIG } from '@/lib/stripe';
import { getEffectiveSubscriptionStatus, isActiveProSubscription } from '@/lib/subscription/status';
import type Stripe from 'stripe';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createSupabaseClient(url, key);
}

async function markSessionFailed(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  sessionId: string,
  failureCode: string | null,
  failureMessage: string | null
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('subscription_sessions')
    .update({
      status: 'failed',
      failure_code: failureCode,
      failure_message: failureMessage,
      last_event_type: 'reconcile:failed',
      processing_started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .is('used_at', null)
    .neq('status', 'succeeded')
    .neq('status', 'cancelled');

  if (error) {
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'invalid_request',
          error: 'session_id is required',
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'unauthorized',
          error: 'ログインが必要です',
        },
        { status: 401 }
      );
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end, updated_at')
      .eq('user_id', user.id)
      .single();

    if (subscriptionError && subscriptionError.code !== 'PGRST116') {
      throw subscriptionError;
    }

    const currentStatus = getEffectiveSubscriptionStatus(
      subscription?.status ?? 'free',
      subscription?.plan ?? 'free',
      subscription?.pro_source ?? 'none',
      subscription?.test_pro_expires_at ?? null,
      subscription?.current_period_end ?? null
    );

    const currentIsActivePro = isActiveProSubscription({
      status: currentStatus,
      plan: subscription?.plan ?? 'free',
      proSource: subscription?.pro_source ?? 'none',
      testProExpiresAt: subscription?.test_pro_expires_at ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
    });

    if (currentIsActivePro && subscription?.pro_source === 'billing') {
      return NextResponse.json({
        success: true,
        state: 'confirmed',
        reason: 'already_active',
        source: 'existing',
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: sessionRow, error: sessionRowError } = await supabaseAdmin
      .from('subscription_sessions')
      .select(
        'id, user_id, used_at, stripe_customer_id, stripe_subscription_id, plan_id, status, failure_code, failure_message, last_event_type'
      )
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionRowError) {
      throw sessionRowError;
    }

    if (!sessionRow) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'unknown_session',
          error: 'unknown session id',
        },
        { status: 404 }
      );
    }

    if (sessionRow.user_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'forbidden_session',
          error: 'forbidden session id',
        },
        { status: 403 }
      );
    }

    if (sessionRow.status === 'failed') {
      return NextResponse.json({
        success: true,
        state: 'failed',
        reason: 'payment_failed',
        paymentStatus: 'failed',
        failureCode: sessionRow.failure_code ?? null,
        failureMessage: sessionRow.failure_message ?? null,
      });
    }

    if (sessionRow.status === 'cancelled') {
      return NextResponse.json({
        success: true,
        state: 'failed',
        reason: 'session_cancelled',
        paymentStatus: 'cancelled',
      });
    }

    // Retrieve the Stripe Checkout Session to verify payment status
    let checkoutSession: Stripe.Checkout.Session;
    try {
      checkoutSession = await getCheckoutSession(sessionId);
    } catch (error) {
      console.error('[SubscriptionReconcile] Stripe session fetch failed:', {
        sessionId,
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({
        success: true,
        state: 'pending',
        reason: 'stripe_session_fetch_failed',
        paymentStatus: null,
      });
    }

    // Verify metadata
    const metadata = checkoutSession.metadata ?? {};
    if (metadata.user_id && metadata.user_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'metadata_user_mismatch',
          error: 'metadata user mismatch',
        },
        { status: 409 }
      );
    }

    if (metadata.plan_id && metadata.plan_id !== STRIPE_CONFIG.plans.pro.id) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'metadata_plan_id_mismatch',
          error: 'metadata plan_id mismatch',
        },
        { status: 409 }
      );
    }

    const paymentStatus = checkoutSession.payment_status;

    if (paymentStatus !== 'paid') {
      if (paymentStatus === 'unpaid' || checkoutSession.status === 'expired') {
        await markSessionFailed(
          supabaseAdmin,
          sessionId,
          'payment_not_completed',
          `Checkout status: ${checkoutSession.status}, payment: ${paymentStatus}`
        );

        return NextResponse.json({
          success: true,
          state: 'failed',
          reason: 'payment_failed',
          paymentStatus,
        });
      }

      return NextResponse.json({
        success: true,
        state: 'pending',
        reason: 'payment_not_captured',
        paymentStatus,
      });
    }

    // Payment is confirmed — activate billing
    const { customerId, subscriptionId } = extractIdsFromCheckoutSession(checkoutSession);

    // Try to get the Stripe Subscription object for period dates
    let stripeSubscription: Stripe.Subscription | null = null;
    if (typeof checkoutSession.subscription === 'object' && checkoutSession.subscription) {
      stripeSubscription = checkoutSession.subscription as Stripe.Subscription;
    }

    try {
      await activateBillingFromSession(supabaseAdmin, {
        sessionId,
        userId: user.id,
        customerIdFromEvent: customerId,
        subscriptionIdFromEvent: subscriptionId,
        eventType: 'reconcile.confirmed',
        context: 'reconcile',
      }, stripeSubscription);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === BILLING_ACTIVATION_ERRORS.MISSING_CUSTOMER_ID) {
        return NextResponse.json({
          success: true,
          state: 'pending',
          reason: 'customer_not_ready',
          paymentStatus,
        });
      }
      if (message === BILLING_ACTIVATION_ERRORS.ACTIVATION_IN_PROGRESS) {
        return NextResponse.json({
          success: true,
          state: 'pending',
          reason: 'activation_in_progress',
          paymentStatus,
        });
      }
      if (message === BILLING_ACTIVATION_ERRORS.SESSION_CANCELLED) {
        return NextResponse.json({
          success: true,
          state: 'failed',
          reason: 'session_cancelled',
          paymentStatus,
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      state: 'confirmed',
      reason: 'payment_confirmed',
      paymentStatus,
      source: 'reconcile',
    });
  } catch (error) {
    console.error('[SubscriptionReconcile] failed:', error);
    return NextResponse.json(
      {
        success: false,
        state: 'failed',
        reason: 'reconcile_internal_error',
        error: error instanceof Error ? error.message : 'reconcile failed',
      },
      { status: 500 }
    );
  }
}
