import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveSubscriptionStatus, isActiveProSubscription } from '@/lib/subscription/status';

// GET /api/subscription/me
// Returns the authenticated user's subscription snapshot for polling flows.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
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

    const status = getEffectiveSubscriptionStatus(
      subscription?.status ?? 'free',
      subscription?.plan ?? 'free',
      subscription?.pro_source ?? 'none',
      subscription?.test_pro_expires_at ?? null,
      subscription?.current_period_end ?? null
    );

    const plan = subscription?.plan === 'pro' ? 'pro' : 'free';
    const proSource = subscription?.pro_source ?? 'none';
    const testProExpiresAt = subscription?.test_pro_expires_at ?? null;
    const currentPeriodEnd = subscription?.current_period_end ?? null;

    const isActivePro = isActiveProSubscription({
      status,
      plan,
      proSource,
      testProExpiresAt,
      currentPeriodEnd,
    });

    return NextResponse.json({
      success: true,
      subscription: {
        status,
        plan,
        proSource,
        testProExpiresAt,
        currentPeriodEnd,
        isActivePro,
        updatedAt: subscription?.updated_at ?? null,
      },
    });
  } catch (error) {
    console.error('Subscription me API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'サブスクリプション取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
