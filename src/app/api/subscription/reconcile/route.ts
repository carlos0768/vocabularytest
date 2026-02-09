import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { activateBillingFromSession } from '@/lib/subscription/billing-activation';
import { getSession, KOMOJU_CONFIG } from '@/lib/komoju';
import { getEffectiveSubscriptionStatus, isActiveProSubscription } from '@/lib/subscription/status';

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

function isPaymentCaptured(status: string | null): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === 'captured' || normalized === 'completed' || normalized === 'paid';
}

function extractCustomerIdFromSession(session: Awaited<ReturnType<typeof getSession>>): string | null {
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

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json(
        { success: false, state: 'failed', error: 'session_id is required' },
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
        { success: false, state: 'failed', error: 'ログインが必要です' },
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
        source: 'existing',
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: sessionRow, error: sessionRowError } = await supabaseAdmin
      .from('subscription_sessions')
      .select('id, user_id, used_at, komoju_customer_id, komoju_subscription_id, plan_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionRowError) {
      throw sessionRowError;
    }

    if (!sessionRow) {
      return NextResponse.json(
        { success: false, state: 'failed', error: 'unknown session id' },
        { status: 404 }
      );
    }

    if (sessionRow.user_id !== user.id) {
      return NextResponse.json(
        { success: false, state: 'failed', error: 'forbidden session id' },
        { status: 403 }
      );
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
      });
    }

    if (komojuSession.amount !== KOMOJU_CONFIG.plans.pro.price) {
      return NextResponse.json(
        { success: false, state: 'failed', error: 'amount mismatch' },
        { status: 409 }
      );
    }

    if ((komojuSession.currency || '').toUpperCase() !== KOMOJU_CONFIG.plans.pro.currency.toUpperCase()) {
      return NextResponse.json(
        { success: false, state: 'failed', error: 'currency mismatch' },
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
        { success: false, state: 'failed', error: 'metadata user mismatch' },
        { status: 409 }
      );
    }

    if (metadataPlan && metadataPlan !== 'pro') {
      return NextResponse.json(
        { success: false, state: 'failed', error: 'metadata plan mismatch' },
        { status: 409 }
      );
    }

    if (metadataPlanId && metadataPlanId !== KOMOJU_CONFIG.plans.pro.id) {
      return NextResponse.json(
        { success: false, state: 'failed', error: 'metadata plan_id mismatch' },
        { status: 409 }
      );
    }

    const paymentStatus = komojuSession.payment?.status ?? komojuSession.status ?? null;
    if (!isPaymentCaptured(paymentStatus)) {
      return NextResponse.json({
        success: true,
        state: 'pending',
        reason: 'payment_not_captured',
        paymentStatus,
      });
    }

    await activateBillingFromSession(supabaseAdmin, {
      sessionId,
      userId: user.id,
      customerIdFromEvent: extractCustomerIdFromSession(komojuSession),
      customerIdFromMetadata: metadataCustomerId,
      context: 'reconcile',
    });

    return NextResponse.json({
      success: true,
      state: 'confirmed',
      source: 'reconcile',
    });
  } catch (error) {
    console.error('[SubscriptionReconcile] failed:', error);
    return NextResponse.json(
      {
        success: false,
        state: 'failed',
        error: error instanceof Error ? error.message : 'reconcile failed',
      },
      { status: 500 }
    );
  }
}
