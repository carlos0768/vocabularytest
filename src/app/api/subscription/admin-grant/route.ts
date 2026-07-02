import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSingleLineEnv } from '@/lib/env';
import {
  getEffectiveSubscriptionStatus,
  isActiveProSubscription,
} from '@/lib/subscription/status';

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = readSingleLineEnv('NEXT_PUBLIC_SUPABASE_URL');
    const key = readSingleLineEnv('SUPABASE_SERVICE_ROLE_KEY');

    supabaseAdmin = createClient(
      url.startsWith('http') ? url : `https://${url}`,
      key
    );
  }

  return supabaseAdmin;
}

function isAdminGrantEnabled(): boolean {
  const value = (process.env.ENABLE_TEST_PRO_GRANTS || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export async function POST(request: NextRequest) {
  try {
    if (!isAdminGrantEnabled()) {
      return NextResponse.json(
        { success: false, error: 'Admin Pro grants are disabled.' },
        { status: 403 }
      );
    }

    const adminSecret = readSingleLineEnv('ADMIN_API_SECRET');
    const authHeader = request.headers.get('x-admin-secret');

    if (!adminSecret || authHeader !== adminSecret) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { email, permanent, durationDays } = body as {
      email?: string;
      permanent?: boolean;
      durationDays?: number;
    };

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'email is required' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const { data: usersData, error: userError } = await admin.auth.admin.listUsers();

    if (userError) {
      throw userError;
    }

    const targetUser = usersData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: `User not found: ${email}` },
        { status: 404 }
      );
    }

    const { error: grantError } = await admin.rpc('grant_test_pro', {
      p_user_id: targetUser.id,
      p_permanent: permanent ?? true,
      p_duration_days: durationDays ?? 90,
    });

    if (grantError) {
      throw grantError;
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .select(
        'status, plan, pro_source, test_pro_expires_at, current_period_start, current_period_end, cancel_at_period_end, cancel_requested_at, updated_at'
      )
      .eq('user_id', targetUser.id)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      throw subscriptionError ?? new Error('Subscription row not found after grant');
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
      email,
      userId: targetUser.id,
      subscription: snapshot,
    });
  } catch (error) {
    console.error('[subscription/admin-grant] unexpected error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Admin Pro grant failed',
      },
      { status: 500 }
    );
  }
}
