import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import { getAppStoreConfig } from '@/lib/appstore/config';
import {
  AppStoreSignatureVerificationError,
  AppStoreUpstreamTemporaryError,
  AppStoreVerifyInputError,
  isAllowedAppStoreProduct,
  verifyAppStoreTransaction,
} from '@/lib/appstore/verify';
import {
  getEffectiveSubscriptionStatus,
  isActiveProSubscription,
} from '@/lib/subscription/status';

const requestSchema = z.object({
  transactionId: z.string().trim().min(1).max(200),
  source: z.enum(['purchase', 'restore', 'launch_sync']),
}).strict();

type SubscriptionSnapshot = {
  status?: string | null;
  plan?: string | null;
  pro_source?: string | null;
  test_pro_expires_at?: string | null;
  current_period_end?: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }
  return createSupabaseClient(url, key);
}

function isActiveBillingConflict(subscription: SubscriptionSnapshot | null | undefined): boolean {
  if (!subscription) return false;

  const status = getEffectiveSubscriptionStatus(
    subscription.status ?? 'free',
    subscription.plan ?? 'free',
    subscription.pro_source ?? 'none',
    subscription.test_pro_expires_at ?? null,
    subscription.current_period_end ?? null
  );

  return (
    subscription.pro_source === 'billing' &&
    isActiveProSubscription({
      status,
      plan: subscription.plan ?? 'free',
      proSource: subscription.pro_source ?? 'none',
      testProExpiresAt: subscription.test_pro_expires_at ?? null,
      currentPeriodEnd: subscription.current_period_end ?? null,
    })
  );
}

export const __internal = {
  isActiveBillingConflict,
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient(request);
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const {
      data: { user },
      error: authError,
    } = bearerToken
      ? await supabase.auth.getUser(bearerToken)
      : await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const appStoreConfig = getAppStoreConfig();
    const verified = await verifyAppStoreTransaction(parsed.data.transactionId);

    if (!isAllowedAppStoreProduct(verified.productId, appStoreConfig.allowedProductIds)) {
      return NextResponse.json(
        { success: false, error: 'Unrecognized App Store productId' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: currentSubscription, error: currentSubscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'status, plan, pro_source, test_pro_expires_at, current_period_end, appstore_latest_transaction_id'
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (currentSubscriptionError) {
      throw currentSubscriptionError;
    }

    if (isActiveBillingConflict(currentSubscription)) {
      return NextResponse.json(
        { success: false, error: 'Active billing subscription already exists' },
        { status: 409 }
      );
    }

    const { data: ownerSubscription, error: ownerSubscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('appstore_original_transaction_id', verified.originalTransactionId)
      .maybeSingle();

    if (ownerSubscriptionError) {
      throw ownerSubscriptionError;
    }

    if (ownerSubscription?.user_id && ownerSubscription.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'This App Store subscription belongs to another user' },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const upsertPayload = {
      user_id: user.id,
      status: 'active',
      plan: 'pro',
      pro_source: 'appstore',
      current_period_end: verified.currentPeriodEnd,
      test_pro_expires_at: null,
      cancel_at_period_end: false,
      cancel_requested_at: null,
      appstore_original_transaction_id: verified.originalTransactionId,
      appstore_latest_transaction_id: verified.latestTransactionId,
      appstore_product_id: verified.productId,
      appstore_environment: verified.environment,
      appstore_last_verified_at: nowIso,
      updated_at: nowIso,
    };

    const { error: upsertError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(upsertPayload, { onConflict: 'user_id' });

    if (upsertError) {
      if (upsertError.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'This App Store subscription belongs to another user' },
          { status: 409 }
        );
      }
      throw upsertError;
    }

    const { data: updatedSubscription, error: updatedSubscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end')
      .eq('user_id', user.id)
      .single();

    if (updatedSubscriptionError || !updatedSubscription) {
      throw updatedSubscriptionError ?? new Error('Failed to fetch updated subscription');
    }

    const status = getEffectiveSubscriptionStatus(
      updatedSubscription.status ?? 'free',
      updatedSubscription.plan ?? 'free',
      updatedSubscription.pro_source ?? 'none',
      updatedSubscription.test_pro_expires_at ?? null,
      updatedSubscription.current_period_end ?? null
    );

    const plan = updatedSubscription.plan === 'pro' ? 'pro' : 'free';
    const proSource =
      updatedSubscription.pro_source === 'appstore' ||
      updatedSubscription.pro_source === 'billing' ||
      updatedSubscription.pro_source === 'test' ||
      updatedSubscription.pro_source === 'none'
        ? updatedSubscription.pro_source
        : 'none';

    const isActivePro = isActiveProSubscription({
      status,
      plan,
      proSource,
      testProExpiresAt: updatedSubscription.test_pro_expires_at ?? null,
      currentPeriodEnd: updatedSubscription.current_period_end ?? null,
    });

    return NextResponse.json({
      success: true,
      subscription: {
        status,
        plan,
        proSource,
        currentPeriodEnd: updatedSubscription.current_period_end ?? null,
        isActivePro,
      },
      verified: {
        productId: verified.productId,
        originalTransactionId: verified.originalTransactionId,
        latestTransactionId: verified.latestTransactionId,
        environment: verified.environment,
      },
    });
  } catch (error) {
    if (error instanceof AppStoreVerifyInputError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof AppStoreSignatureVerificationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 422 }
      );
    }

    if (error instanceof AppStoreUpstreamTemporaryError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 502 }
      );
    }

    console.error('[appstore.verify] unexpected error', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
