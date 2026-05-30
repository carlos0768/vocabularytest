import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { cancelSubscriptionImmediately } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isActiveProSubscription } from '@/lib/subscription/status';

type SubscriptionRow = {
  status: string | null;
  plan: string | null;
  pro_source: string | null;
  test_pro_expires_at: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
};

type AccountDeleteDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  getAdmin?: typeof getSupabaseAdmin;
  cancelBillingSubscription?: typeof cancelSubscriptionImmediately;
  now?: () => Date;
};

function toStatusShape(subscription: SubscriptionRow | null) {
  if (!subscription) return null;

  return {
    status: subscription.status,
    plan: subscription.plan,
    proSource: subscription.pro_source,
    testProExpiresAt: subscription.test_pro_expires_at,
    currentPeriodEnd: subscription.current_period_end,
  };
}

function isActiveSubscription(subscription: SubscriptionRow | null, now: Date): boolean {
  return isActiveProSubscription(toStatusShape(subscription), now);
}

function buildConflictResponse(error: string, code: string) {
  return NextResponse.json(
    {
      success: false,
      code,
      error,
    },
    { status: 409 },
  );
}

export async function handleAccountDelete(
  request: NextRequest,
  deps: AccountDeleteDeps = {},
) {
  try {
    const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
    const user = await resolveUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'ログインが必要です' },
        { status: 401 },
      );
    }

    const admin = (deps.getAdmin ?? getSupabaseAdmin)();
    const { data: subscription, error: subscriptionError } = await admin
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end, stripe_subscription_id, cancel_at_period_end')
      .eq('user_id', user.id)
      .maybeSingle<SubscriptionRow>();

    if (subscriptionError) {
      console.error('[account/delete] failed to fetch subscription', subscriptionError);
      return NextResponse.json(
        { success: false, error: 'サブスクリプション情報の取得に失敗しました' },
        { status: 500 },
      );
    }

    const now = (deps.now ?? (() => new Date()))();
    const subscriptionIsActive = isActiveSubscription(subscription ?? null, now);
    let billingSubscriptionCancelled = false;

    if (
      subscriptionIsActive
      && subscription?.pro_source === 'appstore'
      && !subscription.cancel_at_period_end
    ) {
      return buildConflictResponse(
        'App Storeサブスクリプションは先にApp Storeで解約してください',
        'active_appstore_subscription',
      );
    }

    if (subscriptionIsActive && subscription?.pro_source === 'billing') {
      const stripeSubscriptionId = subscription.stripe_subscription_id;
      if (!stripeSubscriptionId) {
        return buildConflictResponse(
          'StripeサブスクリプションIDが見つからないためアカウントを削除できません',
          'missing_stripe_subscription_id',
        );
      }

      const cancelBillingSubscription =
        deps.cancelBillingSubscription ?? cancelSubscriptionImmediately;
      await cancelBillingSubscription(stripeSubscriptionId);
      billingSubscriptionCancelled = true;
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error('[account/delete] failed to delete auth user', deleteError);
      return NextResponse.json(
        { success: false, error: 'アカウント削除に失敗しました' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      billingSubscriptionCancelled,
    });
  } catch (error) {
    console.error('[account/delete] unexpected error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'アカウント削除に失敗しました',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handleAccountDelete(request);
}

export async function DELETE(request: NextRequest) {
  return handleAccountDelete(request);
}
