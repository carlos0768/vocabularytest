import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelSubscription } from '@/lib/komoju';

// POST /api/subscription/cancel
// Cancels the user's active subscription
export async function POST(request: NextRequest) {
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

    if (subscription.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'アクティブなサブスクリプションがありません' },
        { status: 400 }
      );
    }

    // Cancel subscription in KOMOJU
    if (subscription.komoju_subscription_id) {
      try {
        await cancelSubscription(subscription.komoju_subscription_id);
      } catch (komojuError) {
        console.error('KOMOJU cancellation error:', komojuError);
        // Continue with local cancellation even if KOMOJU fails
      }
    }

    // Update local subscription status via RPC (prevents client-side escalations)
    const { error: cancelError } = await supabase.rpc('cancel_own_subscription');

    if (cancelError) {
      throw cancelError;
    }

    return NextResponse.json({
      success: true,
      message: 'サブスクリプションを解約しました',
    });
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
