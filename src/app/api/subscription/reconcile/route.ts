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
import {
  buildReconcileActivationErrorResponse,
  buildReconcileConfirmedResponse,
  buildReconcileFailedResponse,
  buildReconcilePendingResponse,
  classifyCheckoutSessionReconcileState,
  type ReconcileResponseDescriptor,
} from '@/lib/subscription/reconcile-status';
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

function reconcileJson(response: ReconcileResponseDescriptor) {
  if (response.status === undefined) {
    return NextResponse.json(response.body);
  }

  return NextResponse.json(response.body, { status: response.status });
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return reconcileJson(buildReconcileFailedResponse('invalid_request'));
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return reconcileJson(buildReconcileFailedResponse('unauthorized'));
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
      return reconcileJson(buildReconcileConfirmedResponse('already_active'));
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
      return reconcileJson(buildReconcileFailedResponse('unknown_session'));
    }

    if (sessionRow.user_id !== user.id) {
      return reconcileJson(buildReconcileFailedResponse('forbidden_session'));
    }

    if (sessionRow.status === 'failed') {
      return reconcileJson(
        buildReconcileFailedResponse('payment_failed', {
          paymentStatus: 'failed',
          failureCode: sessionRow.failure_code ?? null,
          failureMessage: sessionRow.failure_message ?? null,
        })
      );
    }

    if (sessionRow.status === 'cancelled') {
      return reconcileJson(buildReconcileFailedResponse('session_cancelled'));
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
      return reconcileJson(buildReconcilePendingResponse('stripe_session_fetch_failed', null));
    }

    // Verify metadata
    const metadata = checkoutSession.metadata ?? {};
    if (metadata.user_id && metadata.user_id !== user.id) {
      return reconcileJson(buildReconcileFailedResponse('metadata_user_mismatch'));
    }

    if (metadata.plan_id && metadata.plan_id !== STRIPE_CONFIG.plans.pro.id) {
      return reconcileJson(buildReconcileFailedResponse('metadata_plan_id_mismatch'));
    }

    const paymentStatus = checkoutSession.payment_status;
    const paymentState = classifyCheckoutSessionReconcileState(
      paymentStatus,
      checkoutSession.status
    );

    if (paymentState !== 'confirmed') {
      if (paymentState === 'failed') {
        await markSessionFailed(
          supabaseAdmin,
          sessionId,
          'payment_not_completed',
          `Checkout status: ${checkoutSession.status}, payment: ${paymentStatus}`
        );

        return reconcileJson(
          buildReconcileFailedResponse('payment_failed', {
            paymentStatus,
          })
        );
      }

      return reconcileJson(
        buildReconcilePendingResponse(
          'payment_not_captured',
          paymentStatus
        )
      );
    }

    // Payment is confirmed — activate billing
    const { customerId, subscriptionId } = extractIdsFromCheckoutSession(checkoutSession);

    // Try to get the Stripe Subscription object for period dates
    let stripeSubscription: Stripe.Subscription | null = null;
    if (typeof checkoutSession.subscription === 'object' && checkoutSession.subscription) {
      stripeSubscription = checkoutSession.subscription as Stripe.Subscription;
    } else if (typeof checkoutSession.subscription === 'string' && checkoutSession.subscription) {
      try {
        const { getSubscription } = await import('@/lib/stripe/client');
        stripeSubscription = await getSubscription(checkoutSession.subscription);
      } catch {
        console.warn('[SubscriptionReconcile] Could not fetch subscription for period dates');
      }
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
      const activationErrorResponse = buildReconcileActivationErrorResponse(
        message,
        paymentStatus,
        BILLING_ACTIVATION_ERRORS
      );
      if (activationErrorResponse) {
        return reconcileJson(activationErrorResponse);
      }
      throw error;
    }

    return reconcileJson(
      buildReconcileConfirmedResponse(
        'payment_confirmed',
        paymentStatus
      )
    );
  } catch (error) {
    console.error('[SubscriptionReconcile] failed:', error);
    return reconcileJson(
      buildReconcileFailedResponse('reconcile_internal_error', {
        error: error instanceof Error ? error.message : 'reconcile failed',
      })
    );
  }
}
