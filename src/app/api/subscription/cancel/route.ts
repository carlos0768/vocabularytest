import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isActiveProSubscription } from '@/lib/subscription/status';

// POST /api/subscription/cancel
// Cancels the user's active subscription
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
      .select('*')
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

    return NextResponse.json(
      {
        success: false,
        code: 'CANCELLATION_DISABLED',
        error: '現在、アプリからの解約は受け付けていません。',
      },
      { status: 403 }
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
