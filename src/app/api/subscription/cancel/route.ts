import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { cancelSubscription } from '@/lib/komoju';
import { isActiveProSubscription } from '@/lib/subscription/status';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  return createSupabaseClient(url, key);
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// POST /api/subscription/cancel
// Schedules cancellation (period-end default) for the user's active subscription
export async function POST() {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 }
      );
    }

    // Get user's subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end, komoju_subscription_id, cancel_at_period_end')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { success: false, error: 'サブスクリプションが見つかりません' },
        { status: 404 }
      );
    }

    if (
      !isActiveProSubscription({
        status: subscription.status,
        plan: subscription.plan,
        proSource: subscription.pro_source,
        testProExpiresAt: subscription.test_pro_expires_at,
        currentPeriodEnd: subscription.current_period_end,
      })
    ) {
      return NextResponse.json(
        { success: false, error: 'アクティブなサブスクリプションがありません' },
        { status: 400 }
      );
    }

    if (subscription.pro_source !== 'billing') {
      return NextResponse.json(
        { success: false, error: '課金サブスクリプションのみ解約できます' },
        { status: 400 }
      );
    }

    const komojuSubscriptionId = subscription.komoju_subscription_id;
    if (!komojuSubscriptionId) {
      return NextResponse.json(
        { success: false, error: 'KOMOJUサブスクリプションIDが見つかりません' },
        { status: 409 }
      );
    }

    if (subscription.cancel_at_period_end) {
      return NextResponse.json({
        success: true,
        cancellationType: 'period_end',
        currentPeriodEnd: subscription.current_period_end ?? null,
        message: 'すでに期間末解約が予約されています',
      });
    }

    const komojuResult = await cancelSubscription(komojuSubscriptionId);
    const now = new Date();
    const nowIso = now.toISOString();

    const komojuPeriodEnd = toIsoOrNull(komojuResult.current_period_end);
    const existingPeriodEnd = toIsoOrNull(subscription.current_period_end);
    const effectivePeriodEnd = komojuPeriodEnd ?? existingPeriodEnd;
    const keepUntilPeriodEnd = Boolean(
      effectivePeriodEnd && new Date(effectivePeriodEnd).getTime() > now.getTime()
    );

    const updatePayload = keepUntilPeriodEnd
      ? {
          status: 'active',
          cancel_at_period_end: true,
          cancel_requested_at: nowIso,
          current_period_end: effectivePeriodEnd,
          updated_at: nowIso,
        }
      : {
          status: 'cancelled',
          cancel_at_period_end: false,
          cancel_requested_at: null,
          current_period_end: effectivePeriodEnd ?? nowIso,
          updated_at: nowIso,
        };

    const supabaseAdmin = getSupabaseAdmin();
    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update(updatePayload)
      .eq('user_id', user.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      {
        success: true,
        cancellationType: keepUntilPeriodEnd ? 'period_end' : 'immediate',
        currentPeriodEnd: effectivePeriodEnd ?? null,
        message: keepUntilPeriodEnd
          ? '期間末解約を受け付けました。期間終了日までPro機能を利用できます。'
          : '解約を受け付けました。',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '解約処理に失敗しました',
      },
      { status: 500 }
    );
  }
}
