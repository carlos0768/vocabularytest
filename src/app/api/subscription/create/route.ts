import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createSubscriptionSession, KOMOJU_CONFIG } from '@/lib/komoju';
import { isActiveProSubscription } from '@/lib/subscription/status';

// POST /api/subscription/create
// Creates a KOMOJU subscription session and returns the payment URL
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

    // Check if user already has active subscription
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('status, plan, pro_source, test_pro_expires_at, current_period_end, komoju_customer_id')
      .eq('user_id', user.id)
      .single();

    if (
      isActiveProSubscription({
        status: existingSub?.status,
        plan: existingSub?.plan,
        proSource: existingSub?.pro_source,
        testProExpiresAt: existingSub?.test_pro_expires_at,
        currentPeriodEnd: existingSub?.current_period_end,
      })
    ) {
      return NextResponse.json(
        { success: false, error: '既にProプランに加入しています' },
        { status: 400 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { success: false, error: 'メールアドレスが見つかりません' },
        { status: 400 }
      );
    }

    const planId = KOMOJU_CONFIG.plans.pro.id;
    const customerId = existingSub?.komoju_customer_id ?? null;
    const staleWindowMs = 30 * 60 * 1000;

    const { data: pendingSession, error: pendingSessionError } = await supabase
      .from('subscription_sessions')
      .select('idempotency_key, created_at')
      .eq('user_id', user.id)
      .eq('plan_id', planId)
      .eq('status', 'pending')
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingSessionError) {
      throw pendingSessionError;
    }

    const pendingCreatedAt = pendingSession?.created_at
      ? new Date(pendingSession.created_at).getTime()
      : null;
    const isPendingFresh =
      pendingCreatedAt !== null &&
      Number.isFinite(pendingCreatedAt) &&
      Date.now() - pendingCreatedAt < staleWindowMs;
    const idempotencyKey =
      isPendingFresh && pendingSession?.idempotency_key
        ? pendingSession.idempotency_key
        : randomUUID();

    // Create subscription session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const session = await createSubscriptionSession({
      planId,
      customerEmail: user.email,
      customerId: customerId ?? undefined,
      idempotencyKey,
      returnUrl: `${baseUrl}/subscription/success?session_id={SESSION_ID}`,
      cancelUrl: `${baseUrl}/subscription/cancel`,
      metadata: {
        user_id: user.id,
        plan: 'pro',
        plan_id: planId,
        idempotency_key: idempotencyKey,
        ...(customerId ? { customer_id: customerId } : {}),
      },
    });

    const { error: sessionError } = await supabase
      .from('subscription_sessions')
      .insert({
        id: session.id,
        user_id: user.id,
        plan_id: planId,
        komoju_customer_id: customerId,
        idempotency_key: idempotencyKey,
        status: 'pending',
      });

    if (sessionError && sessionError.code !== '23505') {
      throw sessionError;
    }

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      paymentUrl: session.session_url,
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '決済セッションの作成に失敗しました',
      },
      { status: 500 }
    );
  }
}
