import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  activateBillingFromSession,
  BILLING_ACTIVATION_ERRORS,
} from '@/lib/subscription/billing-activation';
import { getSession, KOMOJU_CONFIG } from '@/lib/komoju';
import { getEffectiveSubscriptionStatus, isActiveProSubscription } from '@/lib/subscription/status';
import { classifyPaymentStatus } from '@/lib/subscription/reconcile-status';

type JsonRecord = Record<string, unknown>;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createSupabaseClient(url, key);
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function getString(record: JsonRecord | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function extractCustomerIdFromSession(session: Awaited<ReturnType<typeof getSession>>): string | null {
  if (typeof session.customer_id === 'string' && session.customer_id) {
    return session.customer_id;
  }

  if (typeof session.customer === 'string' && session.customer) {
    return session.customer;
  }

  if (session.customer && typeof session.customer === 'object') {
    const id = typeof session.customer.id === 'string' ? session.customer.id : null;
    if (id) {
      return id;
    }
  }

  if (session.payment?.customer && typeof session.payment.customer === 'string') {
    return session.payment.customer;
  }

  if (session.payment?.customer_id && typeof session.payment.customer_id === 'string') {
    return session.payment.customer_id;
  }

  return null;
}

function extractFailureCodeFromSession(session: Awaited<ReturnType<typeof getSession>>): string | null {
  const payment = asRecord(session.payment ?? null);
  const sessionRecord = asRecord(session);
  return (
    getString(payment, 'failure_code') ??
    getString(payment, 'error_code') ??
    getString(sessionRecord, 'failure_code') ??
    getString(sessionRecord, 'error_code')
  );
}

function extractFailureMessageFromSession(
  session: Awaited<ReturnType<typeof getSession>>
): string | null {
  const payment = asRecord(session.payment ?? null);
  const sessionRecord = asRecord(session);
  return (
    getString(payment, 'failure_message') ??
    getString(payment, 'error_message') ??
    getString(sessionRecord, 'failure_message') ??
    getString(sessionRecord, 'error_message') ??
    getString(sessionRecord, 'message')
  );
}

async function markSessionFailed(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  sessionId: string,
  paymentStatus: string | null,
  failureCode: string | null,
  failureMessage: string | null
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('subscription_sessions')
    .update({
      status: 'failed',
      failure_code: failureCode,
      failure_message: failureMessage,
      last_event_type: paymentStatus ? `reconcile:${paymentStatus}` : 'reconcile:failed',
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
        'id, user_id, used_at, komoju_customer_id, komoju_subscription_id, plan_id, status, failure_code, failure_message, last_event_type'
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

    let komojuSession: Awaited<ReturnType<typeof getSession>>;
    try {
      komojuSession = await getSession(sessionId);
    } catch (error) {
      console.error('[SubscriptionReconcile] KOMOJU session fetch failed:', {
        sessionId,
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({
        success: true,
        state: 'pending',
        reason: 'komoju_session_fetch_failed',
        paymentStatus: null,
      });
    }

    if (komojuSession.amount !== KOMOJU_CONFIG.plans.pro.price) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'amount_mismatch',
          error: 'amount mismatch',
        },
        { status: 409 }
      );
    }

    if ((komojuSession.currency || '').toUpperCase() !== KOMOJU_CONFIG.plans.pro.currency.toUpperCase()) {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'currency_mismatch',
          error: 'currency mismatch',
        },
        { status: 409 }
      );
    }

    const metadata = asRecord(komojuSession.metadata ?? komojuSession.payment?.metadata ?? null);
    const metadataUserId = getString(metadata, 'user_id');
    const metadataPlan = getString(metadata, 'plan');
    const metadataPlanId = getString(metadata, 'plan_id');
    const metadataCustomerId = getString(metadata, 'customer_id');

    if (metadataUserId && metadataUserId !== user.id) {
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

    if (metadataPlan && metadataPlan !== 'pro') {
      return NextResponse.json(
        {
          success: false,
          state: 'failed',
          reason: 'metadata_plan_mismatch',
          error: 'metadata plan mismatch',
        },
        { status: 409 }
      );
    }

    if (metadataPlanId && metadataPlanId !== KOMOJU_CONFIG.plans.pro.id) {
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

    const paymentStatus = komojuSession.payment?.status ?? komojuSession.status ?? null;
    const classifiedPaymentState = classifyPaymentStatus(paymentStatus);
    if (classifiedPaymentState !== 'confirmed') {
      const failureCode = extractFailureCodeFromSession(komojuSession);
      const failureMessage = extractFailureMessageFromSession(komojuSession);
      if (classifiedPaymentState === 'failed') {
        await markSessionFailed(
          supabaseAdmin,
          sessionId,
          paymentStatus,
          failureCode,
          failureMessage
        );
      }

      return NextResponse.json({
        success: true,
        state: classifiedPaymentState,
        reason:
          classifiedPaymentState === 'failed'
            ? 'payment_failed'
            : 'payment_not_captured',
        paymentStatus,
        failureCode: classifiedPaymentState === 'failed' ? failureCode : null,
        failureMessage: classifiedPaymentState === 'failed' ? failureMessage : null,
      });
    }

    try {
      await activateBillingFromSession(supabaseAdmin, {
        sessionId,
        userId: user.id,
        customerIdFromEvent: extractCustomerIdFromSession(komojuSession),
        customerIdFromMetadata: metadataCustomerId,
        subscriptionIdFromEvent: sessionRow.komoju_subscription_id ?? null,
        eventType: 'reconcile.confirmed',
        context: 'reconcile',
      });
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
