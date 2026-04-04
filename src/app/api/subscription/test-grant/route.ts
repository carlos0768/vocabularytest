import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@/lib/supabase/route-client';
import {
  getEffectiveSubscriptionStatus,
  isActiveProSubscription,
} from '@/lib/subscription/status';

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    supabaseAdmin = createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key
    );
  }

  return supabaseAdmin;
}

function isTestGrantEnabled(): boolean {
  const value = (process.env.ENABLE_TEST_PRO_GRANTS || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export async function POST(request: NextRequest) {
  try {
    if (!isTestGrantEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Test Pro grants are disabled.' },
        { status: 403 }
      );
    }

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
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    const admin = getSupabaseAdmin();
    const { error: grantError } = await admin.rpc('grant_test_pro', {
      p_user_id: user.id,
      p_permanent: false,
      p_duration_days: 90,
    });

    if (grantError) {
      throw grantError;
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .select(
        'status, plan, pro_source, test_pro_expires_at, current_period_start, current_period_end, cancel_at_period_end, cancel_requested_at, updated_at'
      )
      .eq('user_id', user.id)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      throw subscriptionError ?? new Error('Subscription row not found after test grant');
    }

    const status = getEffectiveSubscriptionStatus(
      subscription.status ?? 'free',
      subscription.plan ?? 'free',
      subscription.pro_source ?? 'none',
      subscription.test_pro_expires_at ?? null,
      subscription.current_period_end ?? null
    );

    const plan = subscription.plan === 'pro' ? 'pro' : 'free';
    const proSource =
      subscription.pro_source === 'billing'
      || subscription.pro_source === 'test'
      || subscription.pro_source === 'appstore'
      || subscription.pro_source === 'none'
        ? subscription.pro_source
        : 'none';

    const snapshot = {
      status,
      plan,
      proSource,
      testProExpiresAt: subscription.test_pro_expires_at ?? null,
      currentPeriodStart: subscription.current_period_start ?? null,
      currentPeriodEnd: subscription.current_period_end ?? null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      cancelRequestedAt: subscription.cancel_requested_at ?? null,
      updatedAt: subscription.updated_at ?? null,
      isActivePro: isActiveProSubscription({
        status,
        plan,
        proSource,
        testProExpiresAt: subscription.test_pro_expires_at ?? null,
        currentPeriodEnd: subscription.current_period_end ?? null,
      }),
    };

    return NextResponse.json({
      success: true,
      subscription: snapshot,
    });
  } catch (error) {
    console.error('[subscription/test-grant] unexpected error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Test Pro grant failed',
      },
      { status: 500 }
    );
  }
}
